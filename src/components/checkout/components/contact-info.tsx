/**
 * Copyright 2026 Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { useMemo, useRef, useCallback, useEffect, useState, lazy, Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFetcher, useResolvedPath, useRevalidator } from 'react-router';
import { ToggleCard, ToggleCardEdit, ToggleCardSummary } from '@/components/toggle-card';
import { Button } from '@/components/ui/button';
import { FormInput, FormNativeSelect } from '@/components/form-fields';
import { Typography } from '@/components/typography';
import { Form, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useBasket } from '@/providers/basket';
import { createContactInfoSchema, type ContactInfoData } from '@/lib/checkout/schemas';
import { useLoginSuggestion } from '@/hooks/use-customer-lookup';
import { useCustomerProfile } from '@/hooks/checkout/use-customer-profile';
import { getContactInfoFromCustomer } from '@/lib/customer/profile-utils';
import { getCommonPhoneCountryCodes } from '@/lib/address/country-codes';
import type { CheckoutActionData } from '../types';
import type { action as authorizePasswordlessEmailAction } from '@/routes/action.authorize-passwordless-email';
import { useTranslation } from 'react-i18next';
import { useCheckoutContext } from '@/hooks/use-checkout';
import {
    formatPhoneInput,
    stripNonDigits,
    stripCountryCode,
    formatPhoneDisplay,
    extractCountryCode,
} from '@/lib/address/phone-utils';
import type { OtpFlowActiveRef } from '@/hooks/use-checkout-actions';
import { Spinner } from '@/components/spinner';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { TurnstileWidget } from '@/components/security/turnstile-widget';
import { getTurnstileSiteKey, getTurnstileMode, isTurnstileEnabled } from '@/lib/turnstile/utils';
import { resourceRoutes } from '@/route-paths';

const OtpModal = lazy(() => import('@/components/login/otp-modal'));
const LoginModal = lazy(() => import('@/components/login/login-modal'));

interface ContactInfoProps {
    onSubmit: (data: ContactInfoData) => void;
    isLoading: boolean;
    actionData?: CheckoutActionData;
    onRegisteredUserChoseGuest?: (isGuest: boolean) => void;
    /** Called when shopper completes passwordless OTP at contact (sign-in). Resets UI that was applied for "checkout as guest" skip. */
    onPasswordlessOtpVerified?: () => void;
    /** When true, hide login hints in summary (used after "Checkout as guest" on passwordless OTP — treat as plain guest UX). */
    suppressRegisteredEmailLoginHints?: boolean;
    /** When set, kept in sync so checkout does not advance from contact while OTP modal is open or authorize in flight. */
    otpFlowActiveRef?: OtpFlowActiveRef;
    /** Initial OTP sending state — used in Storybook to show the spinner in the email field without triggering fetcher logic */
    defaultOtpSending?: boolean;
    /** When explicitly false, the Turnstile widget is skipped entirely for this step. Undefined is treated as enabled. */
    emailVerificationEnabled?: boolean;
    // Step state managed by container
    isCompleted: boolean;
    isEditing: boolean;
    onEdit: () => void;
}

export default function ContactInfo({
    onSubmit,
    isLoading,
    actionData: _actionData,
    onRegisteredUserChoseGuest,
    onPasswordlessOtpVerified,
    suppressRegisteredEmailLoginHints = false,
    otpFlowActiveRef,
    defaultOtpSending = false,
    emailVerificationEnabled,
    isCompleted: _isCompleted,
    isEditing,
    onEdit,
}: ContactInfoProps) {
    const cart = useBasket();
    const loginSuggestion = useLoginSuggestion();
    const customerProfile = useCustomerProfile();
    const { shipmentDistribution, exitEditMode } = useCheckoutContext();
    const { t } = useTranslation('checkout');
    const appConfig = useConfig();

    const customerContactInfo = getContactInfoFromCustomer(customerProfile);

    const schema = useMemo(() => createContactInfoSchema(t), [t]);
    const authorizePasswordlessEmailPath = useResolvedPath(resourceRoutes.authorizePasswordlessEmail).pathname;
    const revalidator = useRevalidator();
    // E2e tests can stub this fetcher's response per scenario via
    // e2e/src/utils/login-prefs-stub.ts (`stubLoginPrefs({ branch })`).
    const passwordlessEmailFetcher = useFetcher<typeof authorizePasswordlessEmailAction>({
        key: 'contact-authorize-passwordless-email',
    });
    const lastEmailSentRef = useRef<string | null>(null);
    const otpSuccessRevalidatingRef = useRef(false);
    const [isOtpOpen, setIsOtpOpen] = useState(false);
    const [otpModalEmail, setOtpModalEmail] = useState('');
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

    const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
    const [turnstileBypassed, setTurnstileBypassed] = useState(false);
    const turnstileResetRef = useRef<(() => void) | null>(null);
    const turnstileExecuteRef = useRef<(() => void) | null>(null);
    const tokenConsumedRef = useRef(false);
    // Error message shown when server-side Turnstile verification rejects the request.
    // Generic copy by design - we never tell the shopper *why* (bot detection, replay, etc.)
    // to avoid leaking detection signals to attackers. See README-TURNSTILE.md.
    const [verificationError, setVerificationError] = useState<string | null>(null);
    // Cap auto-retries on consecutive verification failures so a misconfigured key or a
    // genuinely-blocked client doesn't loop forever. After N failures, we still show the
    // error but stop resetting the widget; shopper must refresh to try again.
    const verificationFailureCountRef = useRef(0);
    const MAX_VERIFICATION_RETRIES = 3;

    const turnstileEnabled = isTurnstileEnabled(appConfig) && emailVerificationEnabled !== false;
    const turnstileMode = getTurnstileMode(appConfig);
    const turnstileSiteKey = useMemo(() => {
        if (!turnstileEnabled) return null;
        if (typeof window !== 'undefined') {
            const baseUrl = `${window.location.protocol}//${window.location.host}`;
            return getTurnstileSiteKey(appConfig, baseUrl);
        }
        return null;
    }, [appConfig, turnstileEnabled]);

    const [showTurnstile, setShowTurnstile] = useState(false);

    const turnstilePending = !!(turnstileEnabled && turnstileSiteKey && !turnstileToken && !turnstileBypassed);

    const resetTurnstile = useCallback(() => {
        setTurnstileToken(null);
        turnstileResetRef.current?.();
    }, []);

    const handleTurnstileSuccess = useCallback((token: string) => {
        tokenConsumedRef.current = false;
        setTurnstileToken(token);
    }, []);

    const handleTurnstileError = useCallback(() => {
        setTurnstileToken(null);
    }, []);

    const handleTurnstileExpire = useCallback(() => {
        setTurnstileToken(null);
    }, []);

    // Interactive challenge timeout: Cloudflare's widget auto-refreshes (refresh-timeout
    // 'auto') and a fresh challenge is in flight. Clear our local token so the form waits
    // for the new one; do not surface a message to the shopper since this is normal
    // idle-time recovery, not an error. Genuine retry exhaustion is handled by
    // handleTurnstileRetryExhausted below.
    const handleTurnstileTimeout = useCallback(() => {
        setTurnstileToken(null);
    }, []);

    const handleTurnstileBypass = useCallback(() => {
        setTurnstileBypassed(true);
    }, []);

    // Widget-side retry exhaustion (3 consecutive non-infrastructure errors). The widget
    // could not produce a token, so no place-order request will fire and the server will
    // never send a 403. Surface the same generic verification-error message that WI-10
    // shows for server-side rejection so the shopper isn't silently stuck. We do not
    // auto-reset here - the widget already exhausted its own retry cap; further resets
    // would just loop. The error clears when the shopper focuses the email field again,
    // which also remounts the widget via showTurnstile and gives them a fresh try.
    const handleTurnstileRetryExhausted = useCallback(() => {
        setVerificationError(t('contactInfo.verificationFailed'));
        // Clear any pending submission so the form doesn't try to re-trigger the widget.
        pendingEmailRef.current = null;
    }, [t]);

    const form = useForm<ContactInfoData, void, ContactInfoData>({
        resolver: zodResolver(schema),
        mode: 'onChange',
        defaultValues: {
            email: cart?.customerInfo?.email || customerContactInfo.email || '',
            countryCode: extractCountryCode(
                String(cart?.billingAddress?.phone || cart?.customerInfo?.phone || customerContactInfo.phone || '')
            ),
            phone: stripCountryCode(
                String(cart?.billingAddress?.phone || cart?.customerInfo?.phone || customerContactInfo.phone || '')
            ),
        },
    });

    const formPhone = form.watch('phone');
    const formCountryCode = form.watch('countryCode');
    // Logged-in shoppers: always prefer the saved profile phone over any persisted cart value.
    // Guest shoppers: prefer what they entered in the form, falling back to cart data.
    const summaryPhone = customerProfile
        ? String(
              customerContactInfo.phone || cart?.billingAddress?.phone || cart?.customerInfo?.phone || formPhone || ''
          )
        : String(formPhone || cart?.billingAddress?.phone || cart?.customerInfo?.phone || '');
    const summaryCountryCode = formCountryCode || '+1';

    const countryCodeOptions = useMemo(
        () =>
            getCommonPhoneCountryCodes()
                .filter((c, i, arr) => arr.findIndex((x) => x.dialingCode === c.dialingCode) === i)
                .map((c) => (
                    <option key={c.dialingCode} value={c.dialingCode}>
                        {c.dialingCode}
                    </option>
                )),
        []
    );

    const handleFormSubmit = (data: ContactInfoData) => {
        onSubmit({ ...data, phone: stripNonDigits(data.phone) });
    };

    const pendingEmailRef = useRef<string | null>(null);

    const handleEmailFocus = useCallback(() => {
        if (turnstileEnabled && !showTurnstile) {
            setShowTurnstile(true);
        }
        // Clear any prior verification error when the shopper engages with the field again.
        if (verificationError) {
            setVerificationError(null);
        }
    }, [turnstileEnabled, showTurnstile, verificationError]);

    const handleEmailBlur = useCallback(
        (e: React.FocusEvent<HTMLInputElement>, fieldOnBlur: (e: React.FocusEvent<HTMLInputElement>) => void) => {
            fieldOnBlur(e);
            const raw = (e?.target?.value ?? form.getValues('email'))?.trim() ?? '';
            if (!raw) return;
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return;
            const normalized = raw.toLowerCase();

            if (turnstileEnabled && !showTurnstile) {
                setShowTurnstile(true);
            }

            if (lastEmailSentRef.current === normalized) return;
            if (passwordlessEmailFetcher.state === 'submitting' || passwordlessEmailFetcher.state === 'loading') return;

            if (turnstileEnabled && !turnstileBypassed && (!turnstileToken || tokenConsumedRef.current)) {
                pendingEmailRef.current = raw;
                if (tokenConsumedRef.current) {
                    resetTurnstile();
                } else {
                    turnstileExecuteRef.current?.();
                }
                return;
            }

            lastEmailSentRef.current = normalized;
            const formData = new FormData();
            formData.append('email', raw);
            formData.append('strictVerify', 'true');
            if (turnstileToken) {
                formData.append('turnstileToken', turnstileToken);
                tokenConsumedRef.current = true;
            }
            void passwordlessEmailFetcher.submit(formData, {
                method: 'POST',
                action: authorizePasswordlessEmailPath,
            });
            // Set immediately so "Continue" submit that follows blur does not advance to shipping before OTP modal
            if (otpFlowActiveRef) otpFlowActiveRef.current = true;
        },
        // Ref is stable; .current is mutated intentionally — omit from deps
        // eslint-disable-next-line react-hooks/exhaustive-deps -- otpFlowActiveRef
        [
            form,
            passwordlessEmailFetcher,
            authorizePasswordlessEmailPath,
            turnstileToken,
            turnstileBypassed,
            turnstileEnabled,
            showTurnstile,
            resetTurnstile,
        ]
    );

    useEffect(() => {
        if (turnstileToken === null && pendingEmailRef.current && turnstileEnabled && !turnstileBypassed) {
            turnstileExecuteRef.current?.();
        }
    }, [turnstileToken, turnstileEnabled, turnstileBypassed]);

    useEffect(() => {
        if (!turnstileBypassed || !pendingEmailRef.current) return;
        const raw = pendingEmailRef.current;
        const normalized = raw.toLowerCase();
        if (lastEmailSentRef.current === normalized) return;
        lastEmailSentRef.current = normalized;
        pendingEmailRef.current = null;

        const formData = new FormData();
        formData.append('email', raw);
        formData.append('strictVerify', 'true');
        void passwordlessEmailFetcher.submit(formData, {
            method: 'POST',
            action: authorizePasswordlessEmailPath,
        });
        if (otpFlowActiveRef) otpFlowActiveRef.current = true;
        // eslint-disable-next-line react-hooks/exhaustive-deps -- otpFlowActiveRef is a ref
    }, [turnstileBypassed, passwordlessEmailFetcher, authorizePasswordlessEmailPath]);

    useEffect(() => {
        if (!turnstileToken || !pendingEmailRef.current || tokenConsumedRef.current) return;
        const raw = pendingEmailRef.current;
        const normalized = raw.toLowerCase();
        if (lastEmailSentRef.current === normalized) return;
        lastEmailSentRef.current = normalized;
        pendingEmailRef.current = null;

        const formData = new FormData();
        formData.append('email', raw);
        formData.append('strictVerify', 'true');
        formData.append('turnstileToken', turnstileToken);
        tokenConsumedRef.current = true;
        void passwordlessEmailFetcher.submit(formData, {
            method: 'POST',
            action: authorizePasswordlessEmailPath,
        });
        if (otpFlowActiveRef) otpFlowActiveRef.current = true;
        // eslint-disable-next-line react-hooks/exhaustive-deps -- otpFlowActiveRef is a ref
    }, [turnstileToken, passwordlessEmailFetcher, authorizePasswordlessEmailPath]);

    // When authorize (blur) succeeds, open OTP modal so user can enter the code
    useEffect(() => {
        const { state, data } = passwordlessEmailFetcher;
        if (state === 'idle' && data?.success === true && data?.email) {
            setOtpModalEmail(data.email);
            setIsOtpOpen(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only open modal when state/data from last submit
    }, [passwordlessEmailFetcher.state, passwordlessEmailFetcher.data?.success, passwordlessEmailFetcher.data?.email]);

    useEffect(() => {
        const { state, data } = passwordlessEmailFetcher;
        if (state === 'idle' && data?.requiresLogin === true) {
            setIsLoginModalOpen(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to requiresLogin flag
    }, [passwordlessEmailFetcher.state, passwordlessEmailFetcher.data?.requiresLogin]);

    // Server-side Turnstile rejection (403 NOT_AUTHORIZED) handling.
    // Without this the shopper is silently stuck on the contact step with no feedback.
    // Industry guidance (Cloudflare, Stripe, Shopify): show a generic retry message,
    // reset the widget so a fresh token can be generated, and cap auto-retries so a
    // misconfigured key cannot loop forever.
    useEffect(() => {
        const { state, data } = passwordlessEmailFetcher;
        if (state !== 'idle' || data?.success !== false) return;
        if (data.error?.code !== 'NOT_AUTHORIZED') return;

        verificationFailureCountRef.current += 1;
        setVerificationError(t('contactInfo.verificationFailed'));

        if (verificationFailureCountRef.current < MAX_VERIFICATION_RETRIES) {
            // Allow the same email to retry by clearing the dedupe ref, and reset the
            // widget so the next blur produces a fresh token.
            lastEmailSentRef.current = null;
            tokenConsumedRef.current = false;
            resetTurnstile();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to verification rejection
    }, [
        passwordlessEmailFetcher.state,
        passwordlessEmailFetcher.data?.success,
        passwordlessEmailFetcher.data?.error?.code,
    ]);

    const handleOtpSuccess = useCallback(
        () => {
            onPasswordlessOtpVerified?.();
            otpSuccessRevalidatingRef.current = true;
            void revalidator.revalidate();
            // Clear immediately so useCheckoutActions can exit contact step (ref sync effect runs next render)
            if (otpFlowActiveRef) otpFlowActiveRef.current = false;
            setIsOtpOpen(false);
        },
        // Ref is stable; .current is mutated intentionally — omit from deps
        // eslint-disable-next-line react-hooks/exhaustive-deps -- otpFlowActiveRef
        [onPasswordlessOtpVerified, revalidator]
    );

    const handleLoginModalSuccess = useCallback(
        () => {
            onPasswordlessOtpVerified?.();
            otpSuccessRevalidatingRef.current = true;
            void revalidator.revalidate();
            if (otpFlowActiveRef) otpFlowActiveRef.current = false;
            setIsLoginModalOpen(false);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps -- otpFlowActiveRef
        [onPasswordlessOtpVerified, revalidator]
    );

    // After OTP login, revalidate runs the checkout loader (prefill). When it finishes, clear edit
    // mode so the step advances to computedStep (e.g. REVIEW_ORDER) and summary view shows.
    useEffect(() => {
        if (otpSuccessRevalidatingRef.current && revalidator.state === 'idle') {
            otpSuccessRevalidatingRef.current = false;
            exitEditMode();
        }
    }, [revalidator.state, exitEditMode]);

    const handleResendOtp = useCallback(() => {
        const email = form.getValues('email')?.trim() || otpModalEmail;
        if (!email) return Promise.resolve();
        lastEmailSentRef.current = null;
        const fd = new FormData();
        fd.append('email', email);
        fd.append('strictVerify', 'true');
        if (turnstileToken) {
            fd.append('turnstileToken', turnstileToken);
        }
        void passwordlessEmailFetcher.submit(fd, { method: 'POST', action: authorizePasswordlessEmailPath });
        if (turnstileEnabled) resetTurnstile();
        return Promise.resolve();
    }, [
        form,
        otpModalEmail,
        passwordlessEmailFetcher,
        authorizePasswordlessEmailPath,
        turnstileToken,
        turnstileEnabled,
        resetTurnstile,
    ]);

    /**
     * Checkout only: close OTP without calling verify-passwordless-otp — shopper stays a guest (no SLAS session from OTP).
     * Persists a newly-typed email if it differs from the basket email, then unblocks the contact step.
     */
    const handleCheckoutAsGuestFromOtp = useCallback(() => {
        const typedEmail = form.getValues('email');
        const basketEmail = cart?.customerInfo?.email || '';
        if (typedEmail && typedEmail.toLowerCase() !== basketEmail.toLowerCase()) {
            void form.handleSubmit(handleFormSubmit)();
        }
        lastEmailSentRef.current = null;
        onRegisteredUserChoseGuest?.(true);
        // form and cart are stable across renders; handleFormSubmit is defined above in the same scope
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form, cart, onRegisteredUserChoseGuest]);

    let nextStepButtonLabel = isLoading ? t('contactInfo.saving') : t('contactInfo.continue');

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    const hasPickupItems = shipmentDistribution.hasPickupItems;

    const { t: tBopis } = useTranslation('extBopis');
    if (!isLoading && hasPickupItems) {
        nextStepButtonLabel = tBopis('checkout.contactInfo.continueToPickup');
    }
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    const stepTitle = t('contactInfo.title');

    const isSendingOtp =
        defaultOtpSending ||
        passwordlessEmailFetcher.state === 'submitting' ||
        passwordlessEmailFetcher.state === 'loading';

    // Keep parent ref in sync so checkout does not advance to shipping while OTP/login modal is open or authorize in flight
    useEffect(
        () => {
            if (otpFlowActiveRef) {
                otpFlowActiveRef.current = isSendingOtp || isOtpOpen || isLoginModalOpen;
            }
        },
        // Ref is stable; .current is mutated intentionally — omit from deps
        // eslint-disable-next-line react-hooks/exhaustive-deps -- otpFlowActiveRef
        [isSendingOtp, isOtpOpen, isLoginModalOpen]
    );

    const otpLength = (appConfig?.auth as { otpLength?: number } | undefined)?.otpLength ?? 6;

    return (
        <>
            <ToggleCard
                id="contact-info"
                title={stepTitle}
                titleAs="h2"
                titleClassName="text-2xl font-bold tracking-tight text-card-foreground"
                editing={isEditing}
                onEdit={onEdit}
                editLabel={t('common.edit')}
                disableEdit={!!customerProfile}
                showHeaderSeparator
                isLoading={isLoading}>
                <ToggleCardEdit>
                    <Form {...form}>
                        <form
                            onSubmit={(e) => void form.handleSubmit(handleFormSubmit)(e)}
                            className="flex flex-col gap-4 pt-2 pb-2"
                            noValidate>
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('contactInfo.emailLabel')}*</FormLabel>
                                        <div className="relative">
                                            <FormInput
                                                type="email"
                                                placeholder={t('contactInfo.emailPlaceholder')}
                                                autoComplete="email"
                                                autoFocus={isEditing}
                                                disabled={isSendingOtp}
                                                className="pr-12"
                                                {...field}
                                                onFocus={handleEmailFocus}
                                                onBlur={(e) => handleEmailBlur(e, field.onBlur)}
                                            />
                                            {isSendingOtp && (
                                                <div
                                                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
                                                    aria-hidden>
                                                    <Spinner size="sm" className="text-muted-foreground" />
                                                </div>
                                            )}
                                        </div>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {turnstileEnabled && turnstileSiteKey && showTurnstile && (
                                <TurnstileWidget
                                    siteKey={turnstileSiteKey}
                                    onSuccess={handleTurnstileSuccess}
                                    onError={handleTurnstileError}
                                    onExpire={handleTurnstileExpire}
                                    onTimeout={handleTurnstileTimeout}
                                    onBypass={handleTurnstileBypass}
                                    onRetryExhausted={handleTurnstileRetryExhausted}
                                    enabled={turnstileEnabled}
                                    mode={turnstileMode}
                                    resetRef={turnstileResetRef}
                                    executeRef={turnstileExecuteRef}
                                />
                            )}

                            {verificationError && (
                                <div
                                    role="alert"
                                    className="text-destructive text-sm"
                                    data-testid="contact-info-verification-error">
                                    {verificationError}
                                </div>
                            )}

                            <div className="flex items-start gap-2">
                                <FormField
                                    control={form.control}
                                    name="countryCode"
                                    render={({ field }) => (
                                        <FormItem className="w-20 [&_[data-slot=native-select-wrapper]]:w-full">
                                            <FormLabel>{t('contactInfo.countryCodeLabel')}</FormLabel>
                                            <FormNativeSelect
                                                aria-label={t('contactInfo.countryCodeLabel')}
                                                value={field.value}
                                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                                                    field.onChange(e.target.value)
                                                }>
                                                {countryCodeOptions}
                                            </FormNativeSelect>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="phone"
                                    render={({ field }) => (
                                        <FormItem className="flex-1">
                                            <FormLabel>{t('contactInfo.phoneLabel')}*</FormLabel>
                                            <FormInput
                                                type="tel"
                                                inputMode="numeric"
                                                placeholder={t('contactInfo.phonePlaceholder')}
                                                autoComplete="tel-national"
                                                maxLength={14}
                                                {...field}
                                                onChange={(e) => {
                                                    field.onChange(stripNonDigits(e.target.value).slice(0, 10));
                                                }}
                                                onBlur={(e) => {
                                                    field.onBlur();
                                                    field.onChange(formatPhoneInput(e.target.value));
                                                }}
                                                onFocus={(e) => {
                                                    const digits = stripNonDigits(e.target.value);
                                                    if (digits !== e.target.value) field.onChange(digits);
                                                }}
                                            />
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <div
                                data-checkout-mobile-bar
                                className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background px-6 py-4 lg:static lg:inset-auto lg:z-auto lg:w-full lg:border-0 lg:bg-transparent lg:p-0 lg:pt-2">
                                <Button
                                    type="submit"
                                    disabled={isLoading || turnstilePending || isOtpOpen || isLoginModalOpen}
                                    className="w-full">
                                    {nextStepButtonLabel}
                                </Button>
                            </div>
                        </form>
                    </Form>
                </ToggleCardEdit>

                <ToggleCardSummary>
                    <div className="text-sm font-normal leading-5 text-foreground">
                        <p>
                            {customerContactInfo.email ||
                                cart?.customerInfo?.email ||
                                (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('checkoutEmail')) ||
                                t('contactInfo.notProvided')}
                        </p>
                        {summaryPhone && <p>{formatPhoneDisplay(summaryPhone, summaryCountryCode)}</p>}

                        {!customerProfile &&
                            loginSuggestion.shouldSuggestLogin &&
                            !suppressRegisteredEmailLoginHints && (
                                <Typography variant="small" className="text-accent-foreground">
                                    {t('contactInfo.loginSuggestion')}
                                    <a href="/login" className="underline hover:no-underline">
                                        {t('contactInfo.loginSuggestionLink')}
                                    </a>
                                </Typography>
                            )}
                        {loginSuggestion.isCurrentUser && (
                            <Typography variant="small" className="text-success-foreground">
                                {t('contactInfo.usingRegisteredAccount')}
                            </Typography>
                        )}
                    </div>
                </ToggleCardSummary>
            </ToggleCard>

            {isOtpOpen && (
                <Suspense fallback={null}>
                    <OtpModal
                        isOpen={isOtpOpen}
                        onClose={() => setIsOtpOpen(false)}
                        email={otpModalEmail}
                        onSuccess={handleOtpSuccess}
                        onCheckoutAsGuest={onRegisteredUserChoseGuest ? handleCheckoutAsGuestFromOtp : undefined}
                        onResendCode={handleResendOtp}
                        otpLength={otpLength}
                    />
                </Suspense>
            )}

            {isLoginModalOpen && (
                <Suspense fallback={null}>
                    <LoginModal
                        isOpen={isLoginModalOpen}
                        onOpenChange={(open) => {
                            setIsLoginModalOpen(open);
                            if (!open) {
                                lastEmailSentRef.current = null;
                                if (otpFlowActiveRef) otpFlowActiveRef.current = false;
                            }
                        }}
                        mode="password"
                        isPasswordlessEnabled={false}
                        returnUrl="/checkout"
                        initialEmail={passwordlessEmailFetcher.data?.email || form.getValues('email')}
                        onSuccess={handleLoginModalSuccess}
                        onCheckoutAsGuest={
                            onRegisteredUserChoseGuest
                                ? () => {
                                      const typedEmail = form.getValues('email');
                                      const basketEmail = cart?.customerInfo?.email || '';
                                      if (typedEmail && typedEmail.toLowerCase() !== basketEmail.toLowerCase()) {
                                          void form.handleSubmit(handleFormSubmit)();
                                      }
                                      setIsLoginModalOpen(false);
                                      lastEmailSentRef.current = null;
                                      if (otpFlowActiveRef) otpFlowActiveRef.current = false;
                                      onRegisteredUserChoseGuest(true);
                                  }
                                : undefined
                        }
                    />
                </Suspense>
            )}
        </>
    );
}
