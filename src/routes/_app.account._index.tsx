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
import { lazy, type ReactElement, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Await, useFetcher, useLoaderData, useOutletContext, useRevalidator } from 'react-router';
/** @sfdc-extension-line SFDC_EXT_CUSTOMER_PREFERENCES */
import type { Route } from './+types/_app.account._index';
import { ToggleCard, ToggleCardSummary, ToggleCardEdit } from '@/components/toggle-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AccountDetailSkeleton } from '@/components/account-detail-skeleton';
import { PasswordUpdateForm } from '@/components/password-update-form';
import { CustomerProfileForm } from '@/components/customer-profile-form';
import { EmailUpdateForm } from '@/components/email-update-form';
import { MarketingConsent } from '@/components/account/marketing-consent';
import { useToast } from '@/components/toast';
import type { ShopperConsents, ShopperCustomers } from '@/scapi';
import { useFetcherEffect } from '@/hooks/use-fetcher-effect';
import { useScapiFetcher } from '@/hooks/use-scapi-fetcher';
import { SeoMeta } from '@/components/seo-meta';
import { useAuth } from '@/providers/auth';
import { useTranslation } from 'react-i18next';
/** @sfdc-extension-block-start SFDC_EXT_CUSTOMER_PREFERENCES */
import { getCustomerPreferencesData } from '@/extensions/customer-preferences/lib/api/customer-preferences.server';
import { CustomerPreferencesProvider } from '@/extensions/customer-preferences/context/customer-preferences-context';
import { getAuth as getAuthServer } from '@/middlewares/auth.server';
/** @sfdc-extension-block-end SFDC_EXT_CUSTOMER_PREFERENCES */
import { formatDateForLocale } from '@/lib/date-utils';
import { FETCHER_STATES } from '@/lib/fetcher-states';
import { getPasswordlessErrorMessageKey } from '@/lib/auth/error-handler';
import { buildUrl } from '@salesforce/storefront-next-runtime/site-context';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { useCurrentSiteAndLocaleRef } from '@/hooks/use-current-site-and-locale-ref';
import { useDeferredUnmount } from '@/hooks/use-deferred-unmount';

// Lazy load OTP modal for passwordless email editing
const OtpModal = lazy(() => import('@/components/login/otp-modal').then((m) => ({ default: m.default })));
import { UITarget } from '@/targets/ui-target';
import { resourceRoutes } from '@/route-paths';

type Customer = ShopperCustomers.schemas['Customer'];

type AccountLayoutContext = {
    customer: Promise<Customer | null>;
    subscriptions: Promise<ShopperConsents.schemas['ConsentSubscriptionResponse'] | null>;
};

/** @sfdc-extension-block-start SFDC_EXT_CUSTOMER_PREFERENCES */
/**
 * Loader for the account details page.
 *
 * Returns deferred Promises only — no above-the-fold awaits — so the page
 * shell renders immediately and below-the-fold sections stream in via
 * `<Suspense>` + `<Await>`.
 *
 * This loader exists solely to feed the customer-preferences extension; the
 * surrounding marker block strips the entire export when the extension is
 * uninstalled, so the route falls back to no-loader behavior on main.
 */
export function loader(args: Route.LoaderArgs) {
    const session = getAuthServer(args.context);
    const customerPreferencesPromise =
        session.userType === 'registered' && session.customerId ? getCustomerPreferencesData(session.customerId) : null;

    return {
        customerPreferencesPromise,
    };
}
/** @sfdc-extension-block-end SFDC_EXT_CUSTOMER_PREFERENCES */

/**
 * Account details content component that renders when customer data is loaded.
 * This component receives the resolved customer data and displays the profile information.
 */
function AccountDetailsContent({
    customer,
    subscriptions,
}: {
    customer: Customer | null;
    subscriptions: ShopperConsents.schemas['ConsentSubscriptionResponse'] | null;
}): ReactElement {
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [isEditingPassword, setIsEditingPassword] = useState(false);
    const [isEditingEmail, setIsEditingEmail] = useState(false);
    // Optimistic profile values shown after save until the server customer prop refreshes.
    const [profileOverride, setProfileOverride] = useState<Partial<Customer> | null>(null);

    // OTP modal state for passwordless email editing
    const [isOtpModalOpen, setIsOtpModalOpen] = useState(false);
    const [otpModalEmail, setOtpModalEmail] = useState<string>('');
    // Keep the lazy OTP subtree mounted while open, then unmount shortly after close so its
    // Radix exit animation plays and its useFetcher, resend-countdown timer, and effects tear
    // down instead of lingering for the rest of the session.
    const isOtpModalMounted = useDeferredUnmount(isOtpModalOpen);
    const [otpError, setOtpError] = useState<string | undefined>();
    const [otpModalMode, setOtpModalMode] = useState<'changeEmail' | 'verifyEmail' | 'reauthenticate'>('changeEmail');

    // Clear the override when server data arrives (e.g. after navigation or revalidation).
    useEffect(() => {
        setProfileOverride(null);
    }, [customer]);

    const { addToast } = useToast();
    const updatePasswordLoginFetcher = useFetcher();
    const updateEmailLoginFetcher = useFetcher();
    const passwordResetFetcher = useFetcher<{ success?: boolean; error?: string }>();
    const otpRequestFetcher = useFetcher();
    const logoutFetcher = useFetcher();
    const revalidator = useRevalidator();
    const auth = useAuth();
    const { t, i18n } = useTranslation('account');
    const config = useConfig();
    const { siteRef, localeRef } = useCurrentSiteAndLocaleRef();
    const customerId = auth?.customerId;
    const canSubmitCustomerUpdates = Boolean(customerId);

    const updateProfileFetcher = useScapiFetcher('shopperCustomers', 'updateCustomer', {
        params: {
            path: {
                customerId: customerId || '',
            },
        },
        body: {},
    });

    const passwordFetcher = useScapiFetcher('shopperCustomers', 'updateCustomerPassword', {
        params: {
            path: {
                customerId: customerId || '',
            },
        },
        body: { currentPassword: '', password: '' },
    });

    const updateEmailFetcher = useScapiFetcher('shopperCustomers', 'updateCustomer', {
        params: {
            path: {
                customerId: customerId || '',
            },
        },
        body: {},
    });

    const loginAction = buildUrl({
        to: '/login',
        urlConfig: config.url,
        params: { siteId: siteRef, localeId: localeRef },
    });

    const accountUrl = buildUrl({
        to: '/account',
        urlConfig: config.url,
        params: { siteId: siteRef, localeId: localeRef },
    });

    const logoutAction = buildUrl({
        to: '/logout',
        urlConfig: config.url,
        params: { siteId: siteRef, localeId: localeRef },
    });

    // Merge server customer with optimistic override so saved values display immediately.
    const displayCustomer = useMemo((): Customer | null => {
        if (!customer) return null;
        if (!profileOverride) return customer;
        return { ...customer, ...profileOverride };
    }, [customer, profileOverride]);

    // Extract user info from displayed customer data
    const userInfo = useMemo(
        () => ({
            fullName: `${displayCustomer?.firstName || ''} ${displayCustomer?.lastName || ''}`.trim(),
            email: displayCustomer?.email || displayCustomer?.login || '',
            phoneNumber: displayCustomer?.phoneHome || displayCustomer?.phoneMobile || '',
        }),
        [displayCustomer]
    );

    // emailVerified is only present when "Enable Email Verification" is enabled in Storefront Login Preferences
    const isEmailVerificationEnabled = displayCustomer?.emailVerified !== undefined;
    const isEmailVerified = displayCustomer?.emailVerified ?? false;
    const hasPassword = displayCustomer?.hasPassword !== false;

    /**
     * Handles successful login after password update.
     * Called when the user is successfully authenticated with the new password.
     * You can add additional logic here such as:
     * - Refreshing customer data
     * - Analytics tracking
     * - Cache invalidation
     */
    const handleLoginSuccess = useCallback(() => {
        // Revalidate to refresh customer data
        void revalidator.revalidate();
    }, [revalidator]);

    /**
     * Handles login error after password update.
     * Called when automatic login fails after password update.
     * You can add additional logic here such as:
     * - Error logging
     * - Analytics tracking
     * - Custom error handling
     */
    const handleLoginError = useCallback(() => {
        // Show error toast
        addToast(t('password.autoLoginFailed'), 'error');
    }, [addToast, t]);

    /**
     * Handles profile toggle card edit action.
     * Opens the profile form for editing.
     */
    const handleProfileEdit = () => {
        if (!canSubmitCustomerUpdates) return;
        setIsEditingProfile(true);
    };

    /**
     * Handles password toggle card edit action.
     * Opens the password form for editing.
     */
    const handlePasswordEdit = () => {
        if (!canSubmitCustomerUpdates) return;
        setIsEditingPassword(true);
    };

    // Watch updatePasswordLoginFetcher for automatic login after password update
    // This fetcher is triggered by handlePasswordSuccess when the user updates their password.
    // We use useFetcherEffect to handle the login response and refresh customer data on success,
    // or show an error message if automatic login fails.
    useFetcherEffect<unknown>(updatePasswordLoginFetcher, {
        onSuccess: handleLoginSuccess,
        onError: handleLoginError,
    });

    // Watch updateEmailLoginFetcher for automatic login after email update
    // This fetcher is triggered by handleEmailSuccess when the user updates their email address.
    const handleEmailLoginError = useCallback(() => {
        addToast(t('email.autoLoginFailed'), 'error');
    }, [addToast, t]);

    useFetcherEffect<unknown>(updateEmailLoginFetcher, {
        onSuccess: handleLoginSuccess,
        onError: handleEmailLoginError,
    });

    // Watch passwordResetFetcher for password reset email sending
    const handlePasswordResetSuccess = useCallback(
        (data: { success?: boolean; error?: string } | undefined) => {
            if (data?.error) {
                addToast(data.error, 'error');
            } else {
                addToast(t('password.resetPasswordToast', { email: userInfo.email }), 'success');
            }
        },
        [addToast, t, userInfo.email]
    );

    const handlePasswordResetError = useCallback(
        (error: string | string[]) => {
            const errorMessage = typeof error === 'string' ? error : t('password.resetPasswordFailed');
            addToast(errorMessage, 'error');
        },
        [addToast, t]
    );

    useFetcherEffect<{ success?: boolean; error?: string }>(passwordResetFetcher, {
        onSuccess: handlePasswordResetSuccess,
        onError: handlePasswordResetError,
    });

    // Watch otpRequestFetcher for OTP send errors
    const handleOtpRequestSuccess = useCallback(() => {
        // OTP sent successfully - modal is already open
        setOtpError(undefined);
    }, []);

    const handleOtpRequestError = useCallback(
        (error: string | string[]) => {
            // OTP send failed - show error in modal or as toast
            const errorMessage = typeof error === 'string' ? error : t('email.otpSendFailed');
            setOtpError(errorMessage);
            // If modal isn't open yet, show toast instead
            if (!isOtpModalOpen) {
                addToast(errorMessage, 'error');
            }
        },
        [addToast, t, isOtpModalOpen]
    );

    useFetcherEffect<unknown>(otpRequestFetcher, {
        onSuccess: handleOtpRequestSuccess,
        onError: handleOtpRequestError,
    });

    /**
     * Handles successful profile update.
     * Called when the customer profile form is successfully submitted.
     */
    const handleCustomerProfileSuccess = (formData: {
        firstName: string;
        lastName: string;
        phone?: string;
        gender?: string;
        birthday?: string;
    }) => {
        addToast(t('profile.successMessage'), 'success');
        setIsEditingProfile(false);
        // Show saved values immediately via optimistic override.
        // The override is cleared when the server customer prop refreshes.
        setProfileOverride({
            firstName: formData.firstName,
            lastName: formData.lastName,
            phoneHome: formData.phone ?? undefined,
            gender: formData.gender ? Number(formData.gender) : undefined,
            birthday: formData.birthday ?? undefined,
        });
    };

    /**
     * Handles profile update errors.
     */
    const handleCustomerProfileError = (error: string) => {
        addToast(error, 'error');
    };

    /**
     * Handles customer profile cancel action.
     * Resets the form and calls the onCancel callback if provided.
     */
    const handleCustomerProfileCancel = () => {
        setIsEditingProfile(false);
    };

    /**
     * Handles email toggle card edit action.
     * Triggers OTP verification flow before allowing email edit.
     */
    const handleEmailEdit = () => {
        if (!canSubmitCustomerUpdates) return;
        const currentEmail = userInfo.email;
        if (!currentEmail) return;

        if (customer?.hasPassword) {
            setIsEditingEmail(true);
            return;
        }

        // Send OTP first before allowing email edit
        setOtpModalEmail(currentEmail);
        setOtpError(undefined);
        setOtpModalMode('changeEmail');

        // Send OTP request
        const formData = new FormData();
        formData.append('email', currentEmail);

        void otpRequestFetcher.submit(formData, {
            method: 'POST',
            action: resourceRoutes.otpRequest,
        });

        // Open OTP modal (lazy loads on first open, unmounts shortly after close)
        setIsOtpModalOpen(true);
    };

    const handleVerifyEmailClick = () => {
        const currentEmail = userInfo.email;
        if (!currentEmail) return;

        setOtpModalEmail(currentEmail);
        setOtpError(undefined);
        setOtpModalMode('verifyEmail');

        const formData = new FormData();
        formData.append('email', currentEmail);

        void otpRequestFetcher.submit(formData, {
            method: 'POST',
            action: resourceRoutes.otpRequest,
        });

        setIsOtpModalOpen(true);
    };

    /**
     * Handles successful email update.
     * Re-authenticates the user with the new email and current password to keep the session valid,
     * since email also serves as the loginId in SFCC.
     *
     * For passwordless shoppers, triggers OTP modal for re-authentication with the new email.
     */
    const handleEmailSuccess = (formData: { email: string; currentPassword: string | undefined }) => {
        addToast(t('email.successMessage'), 'success');
        setIsEditingEmail(false);
        // Show saved email immediately via optimistic override.
        // The override is cleared when the server customer prop refreshes.
        setProfileOverride({ email: formData.email, login: formData.email, emailVerified: false });

        // For passwordless shoppers: trigger OTP modal for re-authentication with new email
        if (!hasPassword && formData.email) {
            setOtpModalEmail(formData.email);
            setOtpError(undefined);
            setOtpModalMode('reauthenticate');

            // Send OTP to new email address via passwordless login flow
            const formDataForOtp = new FormData();
            formDataForOtp.append('email', formData.email);

            void otpRequestFetcher.submit(formDataForOtp, {
                method: 'POST',
                action: resourceRoutes.authorizePasswordlessEmail,
            });

            // Open OTP modal (lazy loads on first open, unmounts shortly after close)
            setIsOtpModalOpen(true);
            return;
        }

        // For password-based shoppers: existing password re-authentication flow
        if (formData.email && formData.currentPassword) {
            void updateEmailLoginFetcher.submit(
                {
                    email: formData.email,
                    password: formData.currentPassword,
                    loginMode: 'password',
                    returnUrl: accountUrl,
                    // Email is used as loginId in SFCC; after an email update the current session
                    // USID is tied to the old identity. Skip it so SLAS issues a fresh session.
                    skipUsid: 'true',
                },
                {
                    method: 'POST',
                    action: loginAction,
                }
            );
        } else {
            addToast(t('email.autoLoginFailed'), 'error');
        }
    };

    /**
     * Handles email update errors.
     */
    const handleEmailError = () => {
        addToast(t('email.errorMessage'), 'error');
    };

    /**
     * Handles email cancel action.
     */
    const handleEmailCancel = () => setIsEditingEmail(false);

    /**
     * Handles successful OTP verification for passwordless email editing.
     * Closes the OTP modal and opens the email edit form, or revalidates after re-authentication.
     */
    const handleOtpSuccess = () => {
        setIsOtpModalOpen(false);
        setOtpError(undefined);

        if (otpModalMode === 'reauthenticate' || otpModalMode === 'verifyEmail') {
            // After email verification, update badge optimistically
            setProfileOverride((prev) => ({ ...prev, emailVerified: true }));
        } else {
            // After initial OTP verification, allow email editing
            setIsEditingEmail(true);
        }
    };

    /**
     * Handles OTP modal cancellation.
     * For reauthentication mode: logs out the user since their JWT is now stale after email change.
     * For other modes: just closes the modal and returns to view mode.
     */
    const handleOtpCancel = () => {
        setIsOtpModalOpen(false);
        setOtpError(undefined);

        // If canceling during reauthentication, the email was already changed on the backend
        // but the JWT still contains the old email. Log out to prevent a broken session state.
        if (otpModalMode === 'reauthenticate') {
            void logoutFetcher.submit(null, {
                method: 'POST',
                action: logoutAction,
            });
        }
    };

    /**
     * Handles OTP resend request.
     * Sends a new OTP to the user's email using the appropriate flow based on mode.
     */
    const handleOtpResend = () => {
        if (otpModalEmail) {
            setOtpError(undefined);
            const formData = new FormData();
            formData.append('email', otpModalEmail);

            void otpRequestFetcher.submit(formData, {
                method: 'POST',
                action:
                    otpModalMode === 'reauthenticate'
                        ? resourceRoutes.authorizePasswordlessEmail
                        : resourceRoutes.otpRequest,
            });
        }
        return Promise.resolve();
    };

    /**
     * Handles OTP code verification.
     * Called when user submits OTP from modal.
     * Uses direct fetch instead of fetcher to avoid overly complex state and lifecycle management for the modal,
     * which would unmount the OTP modal before we can transition to the email edit form.
     *
     * For re-authentication mode, uses the passwordless login endpoint to issue a new JWT.
     * For verification mode, uses the verify-only endpoint.
     */
    const handleVerifyOtp = async (code: string) => {
        setOtpError(undefined);
        try {
            const formData = new FormData();
            formData.append('otpCode', code);
            formData.append('email', otpModalEmail);

            // Use different endpoint based on mode:
            // - 'reauthenticate': Full authentication with new JWT (after email change)
            // - 'changeEmail' or 'verifyEmail': Just verify OTP (before email edit or for verification badge)
            const action =
                otpModalMode === 'reauthenticate' ? resourceRoutes.verifyPasswordlessOtp : resourceRoutes.otpVerify;
            const response = await fetch(action, {
                method: 'POST',
                body: formData,
            });

            const data = (await response.json()) as {
                success?: boolean;
                error?: { message: string };
            };

            if (data.success) {
                handleOtpSuccess();
            } else if (data.error?.message) {
                setOtpError(
                    getPasswordlessErrorMessageKey(data.error.message) === 'errors:invalidToken'
                        ? t('email.invalidOtp')
                        : data.error.message
                );
            }
        } catch {
            setOtpError(t('email.invalidOtp'));
        }
    };

    /**
     * Handles successful password update.
     * Called when the password update form is successfully submitted.
     * Automatically authenticates the user with the new password.
     *
     * @param formData - The form data that was successfully submitted
     */
    const handlePasswordSuccess = (formData: {
        currentPassword: string;
        password: string;
        confirmPassword: string;
    }) => {
        // Show success toast
        addToast(t('password.successMessage'), 'success');
        // Close the editing mode
        setIsEditingPassword(false);

        // Authenticate the user with the new password
        // Get email from customer data (userInfo) and password from formData
        if (userInfo.email && formData.password) {
            // Submit login request with the new password
            void updatePasswordLoginFetcher.submit(
                {
                    email: userInfo.email,
                    password: formData.password,
                    loginMode: 'password',
                    returnUrl: accountUrl,
                },
                {
                    method: 'POST',
                    action: loginAction,
                }
            );
        } else {
            // console.warn('🔐 Missing email or password for authentication after password update');
            addToast(t('password.autoLoginFailed'), 'error');
        }
    };

    /**
     * Handles password update errors.
     */
    const handlePasswordError = (error: string) => {
        addToast(error, 'error');
    };

    /**
     * Handles password cancel action.
     * Resets the form and calls the onCancel callback if provided.
     */
    const handlePasswordCancel = () => {
        setIsEditingPassword(false);
    };

    /**
     * Handles password reset request for users without a password.
     * Sends password reset email by submitting to /action/request-password-reset.
     * Success/error feedback is shown via passwordResetFetcher useFetcherEffect.
     */
    const handlePasswordReset = () => {
        if (userInfo.email) {
            const formData = new FormData();
            formData.append('email', userInfo.email);

            void passwordResetFetcher.submit(formData, {
                method: 'POST',
                action: resourceRoutes.requestPasswordReset,
            });
        }
    };

    return (
        <div className="space-y-5">
            {/* Page Header Card */}
            <Card className="bg-card border-border">
                <CardContent className="px-6 py-3">
                    <h1 className="text-2xl font-semibold text-foreground mb-1">{t('title')}</h1>
                    <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
                </CardContent>
            </Card>

            {/* Personal Information – same layout as Interests & Preferences (header actions top right) */}
            <Card data-testid="profile-card" className="bg-card border-border">
                <CardHeader className="flex flex-row items-start justify-between border-b border-border pb-4">
                    <div className="space-y-1.5">
                        <CardTitle as="h2" className="text-base font-semibold">
                            {t('profile.title')}
                        </CardTitle>
                        <CardDescription className="text-muted-foreground">{t('profile.description')}</CardDescription>
                    </div>
                    {isEditingProfile ? (
                        <div className="flex gap-2">
                            <Button
                                type="submit"
                                form="customer-profile-form"
                                size="sm"
                                disabled={updateProfileFetcher.state === FETCHER_STATES.SUBMITTING}
                                className="">
                                {updateProfileFetcher.state === FETCHER_STATES.SUBMITTING
                                    ? t('common.saving')
                                    : t('common.save')}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleCustomerProfileCancel}
                                disabled={updateProfileFetcher.state === FETCHER_STATES.SUBMITTING}
                                className="bg-card border-border text-foreground hover:bg-muted/50 px-4 py-2 text-sm font-medium">
                                {t('common.cancel')}
                            </Button>
                        </div>
                    ) : (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleProfileEdit}
                            disabled={!canSubmitCustomerUpdates}
                            className="bg-card border-border text-foreground hover:bg-muted/50 px-4 py-2 text-sm font-medium">
                            {t('common.edit')}
                        </Button>
                    )}
                </CardHeader>

                <CardContent className="pt-6">
                    {isEditingProfile ? (
                        <CustomerProfileForm
                            formId="customer-profile-form"
                            hideActions
                            initialData={{
                                firstName: displayCustomer?.firstName || '',
                                lastName: displayCustomer?.lastName || '',
                                phone: displayCustomer?.phoneHome || displayCustomer?.phoneMobile || '',
                                gender: displayCustomer?.gender !== undefined ? String(displayCustomer.gender) : '',
                                birthday: displayCustomer?.birthday || '',
                            }}
                            updateFetcher={updateProfileFetcher}
                            onSuccess={handleCustomerProfileSuccess}
                            onError={handleCustomerProfileError}
                            onCancel={handleCustomerProfileCancel}
                        />
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <p className="text-sm font-medium leading-5 text-foreground">
                                    {t('profile.firstName')}
                                </p>
                                <p
                                    className="text-sm font-normal leading-5 text-muted-foreground"
                                    data-testid="profile-value-firstName">
                                    {displayCustomer?.firstName || t('profile.notProvided')}
                                </p>
                            </div>
                            <div className="space-y-2">
                                <p className="text-sm font-medium leading-5 text-foreground">{t('profile.lastName')}</p>
                                <p
                                    className="text-sm font-normal leading-5 text-muted-foreground"
                                    data-testid="profile-value-lastName">
                                    {displayCustomer?.lastName || t('profile.notProvided')}
                                </p>
                            </div>
                            <div className="space-y-2">
                                <p className="text-sm font-medium leading-5 text-foreground">
                                    {t('profile.phoneNumber')}
                                </p>
                                <p
                                    className="text-sm font-normal leading-5 text-muted-foreground"
                                    data-testid="profile-value-phone">
                                    {userInfo.phoneNumber || t('profile.notProvided')}
                                </p>
                            </div>
                            <div className="space-y-2">
                                <p className="text-sm font-medium leading-5 text-foreground">{t('profile.gender')}</p>
                                <p
                                    className="text-sm font-normal leading-5 text-muted-foreground"
                                    data-testid="profile-value-gender">
                                    {displayCustomer?.gender === 1
                                        ? t('profile.genderOptions.male')
                                        : displayCustomer?.gender === 2
                                          ? t('profile.genderOptions.female')
                                          : t('profile.notProvided')}
                                </p>
                            </div>
                            <div className="space-y-2">
                                <p className="text-sm font-medium leading-5 text-foreground">
                                    {t('profile.dateOfBirth')}
                                </p>
                                <p
                                    className="text-sm font-normal leading-5 text-muted-foreground"
                                    data-testid="profile-value-birthday">
                                    {formatDateForLocale(displayCustomer?.birthday, i18n.language) ||
                                        t('profile.notProvided')}
                                </p>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
            <UITarget targetId="sfcc.myAccount.identity.verification" />

            {/* Email Address Toggle Card */}
            <ToggleCard
                id="email"
                data-testid="sf-toggle-card-email"
                title={t('email.title')}
                description={t('email.description')}
                editing={isEditingEmail}
                showHeaderSeparator
                className="bg-card border-border">
                <ToggleCardSummary>
                    <div
                        className="flex flex-wrap items-center justify-between gap-3"
                        data-testid="sf-toggle-card-email-content">
                        <div className="space-y-2">
                            <h2 className="text-sm font-medium text-foreground">{t('email.title')}</h2>
                            <div className="flex items-center gap-2">
                                <p className="text-sm text-foreground" data-testid="email-value">
                                    {userInfo.email || t('profile.notProvided')}
                                </p>
                                {isEmailVerificationEnabled && (
                                    <Badge
                                        data-testid={
                                            isEmailVerified ? 'email-verified-badge' : 'email-unverified-badge'
                                        }
                                        variant={isEmailVerified ? 'info' : 'secondary'}>
                                        {isEmailVerified ? t('email.verified') : t('email.unverified')}
                                    </Badge>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {isEmailVerificationEnabled && !isEmailVerified && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleVerifyEmailClick}
                                    className="rounded-ui bg-card border-border text-foreground hover:bg-muted/50 px-4 py-2 text-sm font-medium">
                                    {t('email.verifyEmail')}
                                </Button>
                            )}
                            {isEmailVerificationEnabled && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleEmailEdit}
                                    disabled={!canSubmitCustomerUpdates}
                                    className="rounded-ui bg-card border-border text-foreground hover:bg-muted/50 px-4 py-2 text-sm font-medium">
                                    {t('email.changeEmail')}
                                </Button>
                            )}
                        </div>
                    </div>
                </ToggleCardSummary>
                <ToggleCardEdit>
                    <EmailUpdateForm
                        initialData={{ email: userInfo.email }}
                        updateFetcher={updateEmailFetcher}
                        onSuccess={handleEmailSuccess}
                        onError={handleEmailError}
                        onCancel={handleEmailCancel}
                        requirePassword={hasPassword}
                    />
                </ToggleCardEdit>
            </ToggleCard>

            {/* Interests & Preferences Section */}
            <UITarget targetId="sfcc.myAccount.preferences" />

            {/* Password & Security Toggle Card */}
            <ToggleCard
                id="password"
                data-testid="sf-toggle-card-password"
                title={t('password.title')}
                description={t('password.description')}
                editing={isEditingPassword}
                showHeaderSeparator
                className="bg-card border-border">
                <ToggleCardSummary>
                    <div
                        className="flex flex-wrap items-center justify-between gap-3"
                        data-testid="sf-toggle-card-password-content">
                        <div className="space-y-2">
                            <h2 className="text-sm font-medium leading-5 text-foreground">{t('password.password')}</h2>
                            <p className="text-sm font-normal leading-5 text-muted-foreground">
                                {hasPassword ? t('password.hiddenPassword') : t('password.notProvided')}
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={!canSubmitCustomerUpdates}
                            onClick={hasPassword ? handlePasswordEdit : handlePasswordReset}
                            className="bg-card border-border text-foreground hover:bg-muted/50 px-4 py-2 text-sm font-medium">
                            {hasPassword ? t('password.changePassword') : t('password.resetPassword')}
                        </Button>
                    </div>
                </ToggleCardSummary>

                {hasPassword && (
                    <ToggleCardEdit>
                        <PasswordUpdateForm
                            updateFetcher={passwordFetcher}
                            onSuccess={handlePasswordSuccess}
                            onError={handlePasswordError}
                            onCancel={handlePasswordCancel}
                        />
                    </ToggleCardEdit>
                )}
            </ToggleCard>
            <UITarget targetId="sfcc.myAccount.gdpr.dataRequest" />
            <UITarget targetId="sfcc.myAccount.gdpr.deleteAccount" />

            {/* Email Preferences – MarketingConsent (part of My Account) */}
            <MarketingConsent
                subscriptions={subscriptions}
                contactPointValueByChannel={{
                    email: userInfo.email,
                    sms: userInfo.phoneNumber || undefined,
                }}
                onConsentUpdated={() => void revalidator.revalidate()}
            />

            {/* OTP Modal for passwordless email editing */}
            {isOtpModalMounted && (
                <Suspense fallback={null}>
                    <OtpModal
                        isOpen={isOtpModalOpen}
                        onClose={handleOtpCancel}
                        email={otpModalEmail}
                        onSuccess={handleOtpSuccess}
                        onResendCode={handleOtpResend}
                        otpLength={config.auth?.otpLength ?? 6}
                        initialError={otpError}
                        onVerifyCode={(code) => {
                            void handleVerifyOtp(code);
                        }}
                    />
                </Suspense>
            )}
        </div>
    );
}

/**
 * Account details page component that uses Await to handle customer and subscriptions loading.
 * Shows a skeleton while data is being loaded.
 */
export default function AccountDetails(): ReactElement {
    const { customer: customerPromise, subscriptions: subscriptionsPromise } = useOutletContext<AccountLayoutContext>();
    const { t } = useTranslation('account');
    /** @sfdc-extension-block-start SFDC_EXT_CUSTOMER_PREFERENCES */
    const loaderData = useLoaderData<typeof loader>();
    /** @sfdc-extension-block-end SFDC_EXT_CUSTOMER_PREFERENCES */

    // Pin `Promise.all` by input identity. Re-compose only when an input promise changes (e.g., after a revalidation).
    // A clean alternative would be to split the `<AccountDetailsContent>` into two separate components, each consuming
    // a single promise, suspending only when the respective promise changes.
    const pinRef = useRef<{
        inputs: readonly [
            Promise<Customer | null>,
            Promise<ShopperConsents.schemas['ConsentSubscriptionResponse'] | null>,
        ];
        combined: Promise<[Customer | null, ShopperConsents.schemas['ConsentSubscriptionResponse'] | null]>;
    } | null>(null);

    if (
        pinRef.current === null ||
        pinRef.current.inputs[0] !== customerPromise ||
        pinRef.current.inputs[1] !== subscriptionsPromise
    ) {
        pinRef.current = {
            inputs: [customerPromise, subscriptionsPromise],
            combined: Promise.all([customerPromise, subscriptionsPromise]),
        };
    }

    let content: ReactElement = (
        <>
            <SeoMeta title={t('meta.accountDetailsTitle', { defaultValue: 'Account Details' })} noIndex />
            <Suspense fallback={<AccountDetailSkeleton />}>
                <Await resolve={pinRef.current.combined}>
                    {([customer, subscriptions]: [
                        Customer | null,
                        ShopperConsents.schemas['ConsentSubscriptionResponse'] | null,
                    ]) => <AccountDetailsContent customer={customer} subscriptions={subscriptions} />}
                </Await>
            </Suspense>
        </>
    );

    /** @sfdc-extension-block-start SFDC_EXT_CUSTOMER_PREFERENCES */
    if (loaderData?.customerPreferencesPromise) {
        content = (
            <CustomerPreferencesProvider customerPreferencesPromise={loaderData.customerPreferencesPromise}>
                {content}
            </CustomerPreferencesProvider>
        );
    }
    /** @sfdc-extension-block-end SFDC_EXT_CUSTOMER_PREFERENCES */

    return content;
}
