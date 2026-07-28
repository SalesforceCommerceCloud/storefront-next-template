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

import { type ReactElement, useState, useEffect, useRef } from 'react';
import { useFetcher } from 'react-router';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useTranslation } from 'react-i18next';
import StandardLoginForm from '@/components/login/standard-login-form';
import PasswordlessLoginForm from '@/components/login/passwordless-login-form';
import OtpModal from '@/components/login/otp-modal';
import { SocialLoginButtons } from '@/components/buttons/social-login-buttons';
import type { action as loginAction } from '@/routes/_empty.login';

interface LoginModalProps {
    /** Controls modal visibility */
    isOpen: boolean;
    /** Callback when modal should close */
    onOpenChange: (open: boolean) => void;
    /** Initial login mode: 'password' or 'passwordless' */
    mode?: 'password' | 'passwordless';
    /** Whether passwordless login is enabled */
    isPasswordlessEnabled?: boolean;
    /** Whether social login is enabled */
    isSocialLoginEnabled?: boolean;
    /** URL to redirect to after successful login */
    returnUrl?: string;
    /** Pending action to preserve after login */
    action?: string;
    /** Action parameters to preserve after login */
    actionParams?: string;
    /** OTP length for passwordless login */
    otpLength?: number;
    /** Callback when login succeeds */
    onSuccess?: () => void;
    /** Callback when user chooses to continue as guest (checkout context only) */
    onCheckoutAsGuest?: () => void;
    initialEmail?: string;
}

export default function LoginModal({
    isOpen,
    onOpenChange,
    mode = 'password',
    isPasswordlessEnabled = false,
    isSocialLoginEnabled = false,
    returnUrl,
    action: pendingActionName,
    actionParams,
    otpLength = 8,
    onSuccess,
    onCheckoutAsGuest,
    initialEmail,
}: LoginModalProps): ReactElement {
    const { t } = useTranslation('login');
    const fetcher = useFetcher<typeof loginAction>();
    const wasSubmittingRef = useRef(false);
    const [currentMode, setCurrentMode] = useState<'password' | 'passwordless'>(mode);
    const [showOTPModal, setShowOTPModal] = useState(false);
    const [otpEmail, setOtpEmail] = useState<string>('');
    const [error, setError] = useState<string | undefined>();

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setCurrentMode(mode);
            setShowOTPModal(false);
            setOtpEmail('');
            setError(undefined);
        }
    }, [isOpen, mode]);

    // The login action returns data only on intermediate outcomes (OTP prompt, error).
    // On successful login the action returns a Response (redirect) and fetcher.data stays
    // undefined.
    useEffect(() => {
        const data = fetcher.data;
        if (!data) return;
        if (data.showOTPForm && data.email) {
            setOtpEmail(data.email);
            setShowOTPModal(true);
            setError(undefined);
        } else if (data.error) {
            setError(data.error);
        }
    }, [fetcher.data]);

    // Close the modal on successful submit. After a submit cycle (state went non-idle
    // then back to idle) with no fetcher.data, the action redirected → success.
    useEffect(() => {
        if (fetcher.state !== 'idle') {
            wasSubmittingRef.current = true;
            return;
        }
        if (!wasSubmittingRef.current) return;
        wasSubmittingRef.current = false;
        if (fetcher.data) return;
        if (onSuccess) {
            onSuccess();
        } else {
            onOpenChange(false);
        }
    }, [fetcher.state, fetcher.data, onSuccess, onOpenChange]);

    const handleOtpSuccess = () => {
        setShowOTPModal(false);
        if (onSuccess) {
            onSuccess();
        } else {
            window.location.href = returnUrl || '/';
        }
    };

    const handleResendCode = async () => {
        if (!otpEmail) return;

        const formData = new FormData();
        formData.append('email', otpEmail);
        formData.append('loginMode', 'passwordless');
        if (returnUrl) {
            formData.append('redirectPath', returnUrl);
        }

        await fetch('/login', {
            method: 'POST',
            body: formData,
        });
    };

    // Decide which form to render based on mode
    const renderForm = () => {
        if (currentMode === 'passwordless') {
            return (
                <PasswordlessLoginForm
                    error={error}
                    isPasswordlessEnabled={isPasswordlessEnabled}
                    redirectPath={returnUrl}
                    Form={fetcher.Form}
                    // The modal detects success by watching this fetcher return to idle; a
                    // passkey-enabled `redirectDocument` would unmount it first and swallow
                    // `onSuccess`. Force the client-side redirect. See StandardLoginForm.
                    skipDocumentRedirect
                />
            );
        }
        return (
            <StandardLoginForm
                error={error}
                isPasswordlessEnabled={isPasswordlessEnabled}
                returnUrl={returnUrl}
                action={pendingActionName}
                actionParams={actionParams}
                onCheckoutAsGuest={onCheckoutAsGuest}
                initialEmail={initialEmail}
                Form={fetcher.Form}
                skipDocumentRedirect
            />
        );
    };

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-md [&>button]:cursor-pointer">
                    <DialogHeader>
                        <DialogTitle className="text-center text-2xl font-bold">{t('title')}</DialogTitle>
                        <DialogDescription className="text-center">{t('subtitle')}</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6">
                        {renderForm()}
                        {isSocialLoginEnabled ? <SocialLoginButtons /> : null}
                    </div>
                </DialogContent>
            </Dialog>

            {/* OTP Modal - appears over the login modal */}
            <OtpModal
                isOpen={showOTPModal}
                otpLength={otpLength}
                onClose={() => setShowOTPModal(false)}
                email={otpEmail}
                onSuccess={handleOtpSuccess}
                onResendCode={handleResendCode}
            />
        </>
    );
}
