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

'use client';

import { useState, useEffect, useRef, useMemo, type FormEvent } from 'react';
import { useFetcher } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { TurnstileWidget } from '@/components/security/turnstile-widget';
import { parseOrderNumber, parseEmail } from '@/lib/order/lookup/validation';
import { getTurnstileSiteKey, isTurnstileEnabled } from '@/lib/turnstile/utils';
import { OrderLookupErrorMessage } from './error-message';

interface RequestCodeFormProps {
    className?: string;
    initialOrderNumber?: string;
    initialEmail?: string;
    onCodeSent?: (params: { email: string; orderNumber: string }) => void;
}

type FetcherState =
    | {
          ok: true;
          alreadyVerified?: true;
          codeResent?: true;
      }
    | {
          ok: false;
          code: string;
          retryAfterSeconds?: number;
      };

export function RequestCodeForm({ className, initialOrderNumber, initialEmail, onCodeSent }: RequestCodeFormProps) {
    const { t } = useTranslation('guestOrderLookup');
    const config = useConfig();
    const fetcher = useFetcher<FetcherState>();

    const [orderNumber, setOrderNumber] = useState(initialOrderNumber ?? '');
    const [email, setEmail] = useState(initialEmail ?? '');
    const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
    const [orderNumberError, setOrderNumberError] = useState<string | null>(null);
    const [emailError, setEmailError] = useState<string | null>(null);
    const [codeSent, setCodeSent] = useState(false);
    const [sentEmail, setSentEmail] = useState<string>('');
    const [codeResent, setCodeResent] = useState(false);

    const orderNumberInputRef = useRef<HTMLInputElement>(null);
    const emailInputRef = useRef<HTMLInputElement>(null);
    const turnstileResetRef = useRef<(() => void) | null>(null);
    const lastHandledDataRef = useRef<FetcherState | undefined>(undefined);

    const turnstileEnabled = config ? isTurnstileEnabled(config) : false;
    const siteKey = useMemo(() => {
        if (!config || !turnstileEnabled) return null;
        if (typeof window !== 'undefined') {
            const baseUrl = `${window.location.protocol}//${window.location.host}`;
            return getTurnstileSiteKey(config, baseUrl);
        }
        return null;
    }, [config, turnstileEnabled]);
    const isSubmitting = fetcher.state !== 'idle';

    // Handle success response. Guarded by lastHandledDataRef so that re-renders
    // triggered by onCodeSent's navigate() call (which produces a new onCodeSent
    // reference from the parent on every render) don't re-fire this effect and
    // call navigate() again in a loop.
    useEffect(() => {
        if (fetcher.data && fetcher.data !== lastHandledDataRef.current && 'ok' in fetcher.data && fetcher.data.ok) {
            lastHandledDataRef.current = fetcher.data;

            if (!fetcher.data.alreadyVerified) {
                // Normal path: show "check your email" screen before navigating.
                setCodeSent(true);
                setSentEmail(email);
                setCodeResent(fetcher.data.codeResent === true);
            }
            // alreadyVerified: skip OTP entry — navigate straight to results.
            onCodeSent?.({ email, orderNumber });
        }
    }, [fetcher.data, email, orderNumber, onCodeSent]);

    const validateOrderNumber = (value: string): boolean => {
        const result = parseOrderNumber(value);
        if (!result.ok) {
            setOrderNumberError(t('errorInvalidInput'));
            return false;
        }
        setOrderNumberError(null);
        return true;
    };

    const validateEmail = (value: string): boolean => {
        const result = parseEmail(value);
        if (!result.ok) {
            setEmailError(t('errorInvalidInput'));
            return false;
        }
        setEmailError(null);
        return true;
    };

    const handleOrderNumberBlur = () => {
        if (orderNumber.trim()) {
            validateOrderNumber(orderNumber);
        }
    };

    const handleEmailBlur = () => {
        if (email.trim()) {
            validateEmail(email);
        }
    };

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        // Client-side validation
        const isOrderNumberValid = validateOrderNumber(orderNumber);
        const isEmailValid = validateEmail(email);

        if (!isOrderNumberValid || !isEmailValid) {
            // Focus first invalid field
            if (!isOrderNumberValid && orderNumberInputRef.current) {
                orderNumberInputRef.current.focus();
            } else if (!isEmailValid && emailInputRef.current) {
                emailInputRef.current.focus();
            }
            return;
        }

        // Check Turnstile token if enabled
        if (turnstileEnabled && !turnstileToken) {
            return;
        }

        // Submit via fetcher
        const formData = new FormData();
        formData.append('orderNumber', orderNumber.trim());
        formData.append('email', email);
        if (turnstileEnabled && turnstileToken) {
            formData.append('turnstileToken', turnstileToken);
        }

        void fetcher.submit(formData, {
            method: 'post',
            action: '/action/order-lookup-request-code',
        });
    };

    const handleResend = () => {
        // Return to the form so the Turnstile widget is mounted again — resend
        // must go through a fresh challenge, the same as the initial request.
        setTurnstileToken(null);
        setCodeSent(false);
        setCodeResent(false);
    };

    // Show success state after code sent
    if (codeSent) {
        return (
            <div className={className}>
                <Card className="[--ui-border-width:1px]">
                    <CardContent className="space-y-4">
                        <div
                            className="bg-success/10 border border-success/20 text-foreground px-4 py-3 rounded-ui"
                            role="status"
                            aria-live="polite">
                            {t('enterCodeDescription', { email: sentEmail })}
                        </div>
                        {codeResent && <p className="text-sm text-muted-foreground">{t('codeResentHint')}</p>}

                        <Button
                            type="button"
                            onClick={handleResend}
                            disabled={isSubmitting}
                            variant="outline"
                            className="w-full">
                            {isSubmitting ? `${String(t('resend'))}...` : t('resend')}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className={className}>
            <Card className="[--ui-border-width:1px]">
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
                        {fetcher.data && !fetcher.data.ok && (
                            <OrderLookupErrorMessage
                                code={fetcher.data.code}
                                retryAfterSeconds={fetcher.data.retryAfterSeconds}
                                submitBlocking={true}
                            />
                        )}

                        <div>
                            <label htmlFor="orderNumber" className="block text-sm font-medium text-foreground mb-1">
                                {t('orderNumberLabel')}
                            </label>
                            <Input
                                ref={orderNumberInputRef}
                                id="orderNumber"
                                name="orderNumber"
                                type="text"
                                value={orderNumber}
                                onChange={(e) => setOrderNumber(e.target.value)}
                                onBlur={handleOrderNumberBlur}
                                required
                                aria-invalid={!!orderNumberError}
                                aria-describedby={orderNumberError ? 'orderNumber-error' : undefined}
                                disabled={isSubmitting}
                            />
                            {orderNumberError && (
                                <div
                                    id="orderNumber-error"
                                    className="text-destructive text-sm mt-1"
                                    role="alert"
                                    aria-live="polite">
                                    {orderNumberError}
                                </div>
                            )}
                        </div>

                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1">
                                {t('emailLabel')}
                            </label>
                            <Input
                                ref={emailInputRef}
                                id="email"
                                name="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                onBlur={handleEmailBlur}
                                required
                                aria-invalid={!!emailError}
                                aria-describedby={emailError ? 'email-error' : undefined}
                                disabled={isSubmitting}
                            />
                            {emailError && (
                                <div
                                    id="email-error"
                                    className="text-destructive text-sm mt-1"
                                    role="alert"
                                    aria-live="polite">
                                    {emailError}
                                </div>
                            )}
                        </div>

                        {turnstileEnabled && siteKey && (
                            <TurnstileWidget
                                siteKey={siteKey}
                                onSuccess={setTurnstileToken}
                                onExpire={() => setTurnstileToken(null)}
                                resetRef={turnstileResetRef}
                                enabled={turnstileEnabled}
                            />
                        )}

                        <div className="flex justify-start">
                            <Button type="submit" disabled={isSubmitting || (turnstileEnabled && !turnstileToken)}>
                                <Search className="size-4" aria-hidden={true} />
                                {isSubmitting ? `${String(t('submitRequestCode'))}...` : t('submitRequestCode')}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
