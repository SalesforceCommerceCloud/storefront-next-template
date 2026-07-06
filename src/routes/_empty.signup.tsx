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
import { lazy, Suspense, type ReactElement } from 'react';
import { redirect, Form, useActionData, useFetcher } from 'react-router';
import type { Route } from './+types/_empty.signup';
import { useNavigate } from '@/hooks/use-navigate';
import { Link } from '@/components/link';
import { Card } from '@/components/ui/card';
import { resourceRoutes, routes } from '@/route-paths';
// services
import { registerCustomer } from '@/lib/api/auth/register.server';
import {
    appendWishlistMergeFlag,
    captureGuestWishlistSnapshot,
    mergeWishlist,
    type WishlistMergeResult,
} from '@/lib/api/wishlist.server';

// components
import { SignupForm } from '@/components/signup-form';
import { UITarget } from '@/targets/ui-target';
import { SeoMeta } from '@/components/seo-meta';

// utils
import { isPasswordValid, getSafeReturnUrl } from '@/lib/utils';
import { getAuth, authorizePasswordless, requestOtp } from '@/middlewares/auth.server';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { useTranslation } from 'react-i18next';
import { getLogger } from '@/lib/logger.server';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getPasswordlessErrorMessageKey, extractErrorMessage } from '@/lib/auth/error-handler';
import { getLoginPreferences } from '@/lib/login-preferences.server';

const OtpModal = lazy(() => import('@/components/login/otp-modal'));

type SignupLoaderData = {
    showOTPModal: boolean;
    email: string;
    firstName: string;
    lastName: string;
    returnUrl: string;
    isPasswordlessEnabled: boolean;
    otpLength: number;
    registrationMode: string;
};

type RegistrationMode = 'passwordless' | 'password';

type SignupActionResponse = {
    error: string;
};

export async function loader({ request, context }: Route.LoaderArgs): Promise<SignupLoaderData | Response> {
    const session = getAuth(context);
    const url = new URL(request.url);
    const isOtpPending = url.searchParams.get('otp') === 'true';

    // If the user is already registered and the OTP is not pending, redirect to the home page
    if (session.userType === 'registered' && !isOtpPending) {
        return redirect(routes.home);
    }

    const config = getConfig(context);
    // Enabling the email verification site preference will enable the passwordless registration flow.
    const { emailVerificationEnabled } = await getLoginPreferences(context);
    const isPasswordlessEnabled = Boolean(emailVerificationEnabled);

    return {
        showOTPModal: isOtpPending,
        email: url.searchParams.get('email') || '',
        firstName: url.searchParams.get('firstName') || '',
        lastName: url.searchParams.get('lastName') || '',
        returnUrl: getSafeReturnUrl(url.searchParams.get('returnUrl')),
        isPasswordlessEnabled,
        otpLength: config.auth.otpLength,
        registrationMode: url.searchParams.get('registrationMode') || '',
    };
}

/**
 * This server action is required for authentication, because registration must be handled server-side for security reasons,
 * and proper integration with session management and Salesforce Commerce Cloud's authentication system.
 */
export async function action({ request, context }: Route.ActionArgs): Promise<SignupActionResponse | Response> {
    const logger = getLogger(context);
    const { t } = getTranslation(context);
    const formData = await request.formData();
    const firstName = formData.get('firstName')?.toString();
    const lastName = formData.get('lastName')?.toString();
    const email = formData.get('email')?.toString();
    const registrationMode = formData.get('registrationMode')?.toString() as RegistrationMode;
    const url = new URL(request.url);
    const returnUrl = getSafeReturnUrl(url.searchParams.get('returnUrl'));

    logger.debug('Signup: starting');

    // Passwordless registration flow
    if (registrationMode === 'passwordless') {
        if (!firstName || !lastName || !email) {
            logger.warn('Signup (passwordless): missing required fields');
            return { error: t('signup:allFieldsRequired') };
        }

        try {
            await authorizePasswordless(context, {
                userid: email,
                registerCustomer: true,
                firstName,
                lastName,
            });

            logger.info('Signup (passwordless): OTP sent');

            // Redirect to the same page with the otp=true query parameter to show the OTP modal and
            // prompt the user to enter the OTP.
            const params = new URLSearchParams({
                otp: 'true',
                email,
                firstName,
                lastName,
                returnUrl,
                registrationMode: 'passwordless',
            });
            return redirect(`${url.pathname}?${params.toString()}`);
        } catch (error) {
            logger.error('Signup (passwordless): failed', { error });
            return { error: t(getPasswordlessErrorMessageKey(extractErrorMessage(error))) };
        }
    }

    // Standard registration flow
    const password = formData.get('password')?.toString();
    const confirmPassword = formData.get('confirmPassword')?.toString();

    if (!firstName || !lastName || !email || !password || !confirmPassword) {
        logger.warn('Signup: missing required fields');
        return { error: t('signup:allFieldsRequired') };
    }

    if (password !== confirmPassword) {
        logger.warn('Signup: passwords do not match');
        return { error: t('signup:passwordsDoNotMatch') };
    }

    if (!isPasswordValid(password)) {
        logger.warn('Signup: password not secure');
        return { error: t('signup:passwordNotSecure') };
    }

    // Snapshot the guest wishlist BEFORE the SLAS swap. registerCustomer auto-logs the user in,
    // and the registered token cannot authorize a read against the guest customerId.
    const guestWishlistSnapshot = await captureGuestWishlistSnapshot(context);

    // Register the customer
    const result = await registerCustomer(context, {
        customer: {
            firstName,
            lastName,
            login: email,
            email,
        },
        password,
    });

    if (!result.success) {
        logger.warn('Signup: registration failed');
        return { error: result.error || t('errors:genericTryAgain') };
    }

    logger.info('Signup: registration succeeded');

    const { emailVerificationEnabled } = await getLoginPreferences(context);
    const isEmailVerificationEnabled = Boolean(emailVerificationEnabled);

    if (!isEmailVerificationEnabled) {
        let wishlistMergeResult: WishlistMergeResult | null = null;
        if (guestWishlistSnapshot) {
            try {
                wishlistMergeResult = await mergeWishlist(context, guestWishlistSnapshot);
            } catch (error) {
                logger.error('Signup: wishlist merge failed', { error });
            }
        }

        if (wishlistMergeResult) {
            const { url: redirectUrl, setCookie } = appendWishlistMergeFlag(context, returnUrl, wishlistMergeResult);
            return redirect(redirectUrl, { headers: { 'Set-Cookie': setCookie } });
        }
        return redirect(returnUrl);
    }

    // Request OTP for email verification if feature is enabled
    try {
        await requestOtp(context, { email });

        logger.info('Signup: OTP requested after password registration');
        // Redirect to the same page with the otp=true query parameter to show the OTP modal and
        // prompt the user to enter the OTP.
        const params = new URLSearchParams({
            otp: 'true',
            email,
            returnUrl,
            registrationMode: 'password',
        });
        return redirect(`${url.pathname}?${params.toString()}`);
    } catch (error) {
        logger.error('Signup: OTP request failed after password registration, redirecting to returnUrl', {
            error,
        });
        return redirect(returnUrl);
    }
}

export default function Signup({ loaderData }: { loaderData: SignupLoaderData }): ReactElement {
    const actionData = useActionData<typeof action>();
    const error = actionData?.error;
    const { t } = useTranslation('signup');
    const { showOTPModal, email, firstName, lastName, returnUrl, isPasswordlessEnabled, otpLength, registrationMode } =
        loaderData;
    const navigate = useNavigate();
    const resendCodeFetcher = useFetcher();

    const handleResendCode = async (): Promise<void> => {
        if (registrationMode === 'password') {
            // For password registration, POST to the otp-request action to request a new OTP for email verification.
            const formData = new FormData();
            formData.append('email', email);
            await resendCodeFetcher.submit(formData, { method: 'POST', action: resourceRoutes.otpRequest });
        } else {
            // For passwordless registration, POST to this URL so the route action runs and triggers the passwordless authorize API to send another OTP.
            const formData = new FormData();
            formData.append('email', email);
            formData.append('firstName', firstName);
            formData.append('lastName', lastName);
            formData.append('registrationMode', 'passwordless');
            await resendCodeFetcher.submit(formData, { method: 'POST' });
        }
    };

    return (
        <>
            <div
                data-section="auth"
                className="min-h-screen flex items-center justify-center bg-background py-12 section-container">
                <SeoMeta
                    title={t('meta.title', { defaultValue: 'Sign Up' })}
                    description={t('meta.description', {
                        defaultValue: 'Create an account to save your preferences and track your orders.',
                    })}
                    openGraph={{ type: 'website' }}
                />
                <div className="max-w-md w-full space-y-8">
                    <div>
                        <h2 className="mt-6 text-center text-3xl font-bold text-foreground">{t('title')}</h2>
                        <p className="mt-2 text-center text-sm text-muted-foreground">{t('subtitle')}</p>
                    </div>

                    <Card className="p-8">
                        <Form method="POST">
                            <SignupForm error={error} isPasswordless={isPasswordlessEnabled} />

                            <div className="text-center mt-6">
                                <p className="text-sm text-muted-foreground">
                                    {t('haveAccountQuestion')}
                                    <Link to={routes.login} className="font-medium text-primary hover:underline">
                                        {t('signIn')}
                                    </Link>
                                </p>
                            </div>
                        </Form>
                    </Card>
                    <UITarget targetId="sfcc.userRegistration.address.validation" />
                </div>
            </div>
            {showOTPModal && (
                <Suspense fallback={null}>
                    <OtpModal
                        isOpen={showOTPModal}
                        email={email}
                        otpLength={otpLength}
                        isRegistration={true}
                        verifyActionUrl={
                            // otp-verify: email verification for password registrations
                            // verify-passwordless-otp: passwordless registration verification
                            registrationMode === 'password'
                                ? resourceRoutes.otpVerify
                                : resourceRoutes.verifyPasswordlessOtp
                        }
                        onClose={() => {
                            if (isPasswordlessEnabled && registrationMode === 'passwordless') {
                                // Passwordless registration should not redirect because the account is not created until the OTP is verified.
                                void navigate('/signup');
                            } else {
                                // Password registration should redirect to the return URL as the account is created and email verification is not required.
                                // The user can complete email verification in the Account Details page.
                                void navigate(returnUrl);
                            }
                        }}
                        onSuccess={() => {
                            void navigate(returnUrl);
                        }}
                        onResendCode={handleResendCode}
                    />
                </Suspense>
            )}
        </>
    );
}
