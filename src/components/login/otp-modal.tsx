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
import { useState, useEffect, useRef, type ReactElement } from 'react';
import { useFetcher } from 'react-router';
import type { ShopperLogin } from '@/scapi';
import { getPasswordlessErrorMessageKey } from '@/lib/auth/error-handler';
import type { action as verifyPasswordlessOtpAction } from '@/routes/action.verify-passwordless-otp';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Typography } from '@/components/typography';
import { useTranslation } from 'react-i18next';
import { useOtpVerification } from '@/hooks/use-otp-verification';
import { resourceRoutes } from '@/route-paths';

interface OtpModalProps {
    isOpen: boolean;
    onClose: () => void;
    email: string;
    onSuccess: (
        tokenResponse?: ShopperLogin.schemas['TokenResponse'],
        meta?: { wishlistMerge?: 'success' | 'partial' }
    ) => void;
    onCheckoutAsGuest?: () => void;
    onResendCode?: () => Promise<void>;
    otpLength?: number;
    initialError?: string;
    verifyActionUrl?: string; // Custom action endpoint (defaults to resourceRoutes.verifyPasswordlessOtp)
    onVerifyCode?: (code: string) => void; // Callback to handle OTP verification externally
    isRegistration?: boolean;
}

// SLAS issues OTPs in the 6-to-8-digit range (pwd_action_token: ^[0-9]{6,8}$).
// `otpLength` is the storefront's configured guess at the length, but SLAS owns
// what it actually sends, so the two can drift. The modal renders `otpLength`
// slots initially and expands toward this ceiling when a longer code is pasted,
// so a code longer than the configured length is still enterable; MIN_OTP_LENGTH
// is the shortest code SLAS can issue, the floor below which a code can't submit.
const MIN_OTP_LENGTH = 6;
const MAX_OTP_LENGTH = 8;

export default function OtpModal({
    isOpen,
    onClose,
    email,
    onSuccess,
    onCheckoutAsGuest,
    onResendCode,
    otpLength = 6,
    initialError,
    verifyActionUrl = resourceRoutes.verifyPasswordlessOtp,
    onVerifyCode,
    isRegistration = false,
}: OtpModalProps): ReactElement {
    // Track if we've already called onSuccess to prevent infinite loops
    const hasCalledOnSuccessRef = useRef(false);
    const { t } = useTranslation('login');
    const fetcherKey = verifyActionUrl === resourceRoutes.otpVerify ? 'otp-email-verification' : 'otp-verification';
    const fetcher = useFetcher<typeof verifyPasswordlessOtpAction>({ key: fetcherKey });
    const [error, setError] = useState<string | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);
    const [resendTimer, setResendTimer] = useState(0);

    const isLoading = fetcher.state === 'submitting' || fetcher.state === 'loading';

    const handleVerify = (code: string) => {
        setError(null);
        // The reopen and initialError effects clear this, and a successful
        // verification closes the modal; the submit path gates on it.
        setIsVerifying(true);

        // If onVerifyCode callback is provided, use it (parent handles verification)
        if (onVerifyCode) {
            onVerifyCode(code);
            return;
        }

        // Otherwise use fetcher
        const formData = new FormData();
        formData.append('otpCode', code);
        formData.append('email', email);
        if (isRegistration) {
            formData.append('isRegistration', 'true');
        }
        void fetcher.submit(formData, {
            method: 'POST',
            action: verifyActionUrl,
        });
    };

    // The hook manages a fixed pool of MAX_OTP_LENGTH slots so a code longer than
    // the configured `otpLength` can still be entered; the modal renders only as
    // many as the configured length or the entered code needs (see visibleCount).
    const { otpInputs, otpInputsRef, refCallbacks } = useOtpVerification({
        slotCount: MAX_OTP_LENGTH,
    });
    // Resend countdown (same behavior as avinash branch)
    useEffect(() => {
        if (resendTimer > 0) {
            const timer = setTimeout(() => {
                setResendTimer((prev) => prev - 1);
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [resendTimer]);

    // Reset form and OTP inputs when modal opens
    useEffect(() => {
        if (isOpen) {
            otpInputsRef.current.clear();
            setError(initialError ?? null);
            setIsVerifying(false);
            setResendTimer(0);

            requestAnimationFrame(() => {
                const alreadyFocused = otpInputsRef.current.inputRefs.current.some(
                    (ref) => ref && ref === document.activeElement
                );
                if (!alreadyFocused) {
                    otpInputsRef.current.inputRefs.current[0]?.focus();
                }
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // Update error when initialError changes (for external fetcher/manual error handling)
    useEffect(() => {
        if (initialError) {
            setError(initialError);
            setIsVerifying(false);
            // Clear OTP inputs so user can retry
            otpInputsRef.current.clear();
        }
    }, [initialError, otpInputsRef]);

    // Reset success guard when closing or submitting
    useEffect(() => {
        if (!isOpen || fetcher.state === 'submitting') {
            hasCalledOnSuccessRef.current = false;
        }
    }, [isOpen, fetcher.state]);

    useEffect(() => {
        // Skip this effect if using onVerifyCode callback (parent handles verification externally)
        if (onVerifyCode) {
            return;
        }

        // Only proceed when fetcher is idle (server action has completed)
        // AND we haven't already called onSuccess for this verification
        // AND we have success data
        if (fetcher.state === 'idle' && fetcher.data?.success === true && !hasCalledOnSuccessRef.current) {
            // Mark that we've called onSuccess IMMEDIATELY to prevent duplicate calls
            hasCalledOnSuccessRef.current = true;
            setError(null);
            setIsVerifying(false);
            // Clearing here drops enteredOtp to empty so the auto-submit effect can't
            // re-fire this now-consumed code if a caller keeps the modal mounted while
            // closing (isVerifying flips back to false with the slots still full).
            otpInputsRef.current.clear();
            onSuccess(
                fetcher.data.tokenResponse,
                fetcher.data.wishlistMerge ? { wishlistMerge: fetcher.data.wishlistMerge } : undefined
            );
        }
        // Failure
        else if (fetcher.state === 'idle' && fetcher.data?.success === false && fetcher.data?.error) {
            const rawMessage = fetcher.data.error.message;
            const errorMessageKey = getPasswordlessErrorMessageKey(rawMessage);
            const userFriendlyError = String(t(errorMessageKey as never));
            setError(userFriendlyError);
            setIsVerifying(false);
            // Clear OTP inputs so user can retry
            otpInputsRef.current.clear();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetcher.state, fetcher.data, onSuccess, onVerifyCode]);

    const handleResend = async () => {
        if (!onResendCode || resendTimer > 0) return;

        setResendTimer(5);
        try {
            await onResendCode();
        } catch {
            setError(t('resendCodeError'));
            setResendTimer(0);
        }
    };

    const handleCheckoutAsGuest = () => {
        if (onCheckoutAsGuest) {
            onCheckoutAsGuest();
        }
        onClose();
    };

    const handleInputChange = (index: number, value: string) => {
        otpInputs.setValue(index, value);
        setError(null);
    };

    const enteredOtp = otpInputs.values.join('');
    // Render `otpLength` slots by default, but expand to fit a longer entered code
    // (a paste fills more of the fixed pool) up to the SLAS ceiling — so the box
    // count matches the code the shopper actually has, in either drift direction.
    const visibleCount = Math.min(Math.max(otpLength, enteredOtp.length), MAX_OTP_LENGTH);
    // A gap (an empty slot before a filled one) would make `join('')` collapse to a
    // code that doesn't match what's shown, so only a gapless run of slots can submit.
    const hasGap = otpInputs.values.some((value, index) => value === '' && index < enteredOtp.length);
    const isResendDisabled = resendTimer > 0 || isVerifying || isLoading;

    // Auto-submit once the visible slots are completely filled — whether the code was
    // typed or pasted. Firing at `=== visibleCount` (rather than the moment MIN_OTP_LENGTH
    // is reached) is what keeps a too-long delivered code safe: a paste expands
    // visibleCount to the pasted length so the whole code submits at once, while a
    // half-typed entry in a longer field never fires a short prefix. MIN_OTP_LENGTH
    // floors a misconfigured `otpLength` below SLAS's shortest code; hasGap blocks a
    // cleared middle slot, whose join('') would otherwise submit a code missing a digit.
    // Submission flips isVerifying synchronously, so a completed code fires exactly once.
    useEffect(() => {
        if (
            enteredOtp.length === visibleCount &&
            enteredOtp.length >= MIN_OTP_LENGTH &&
            !hasGap &&
            !isVerifying &&
            !isLoading
        ) {
            handleVerify(enteredOtp);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enteredOtp, visibleCount, hasGap, isVerifying, isLoading]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent data-testid="otp-modal" className="sm:max-w-lg [&>button]:cursor-pointer">
                <DialogHeader>
                    <DialogTitle>{t('otpModalTitle')}</DialogTitle>
                    <DialogDescription>{t('otpModalDescription', { email, otpLength })}</DialogDescription>
                </DialogHeader>
                <div className="space-y-6 flex flex-col items-center w-full">
                    {/* Cap each slot at 3rem (the design width) but let the tracks shrink
                        to fit when there are many, so a full 8-slot row never overflows the
                        dialog on a narrow viewport. */}
                    <div
                        className="grid gap-3 w-full justify-center"
                        style={{ gridTemplateColumns: `repeat(${visibleCount}, minmax(0, 3rem))` }}>
                        {Array.from({ length: visibleCount }, (_, index) => `otp-input-${index}`).map(
                            (inputId, index) => (
                                <Input
                                    key={inputId}
                                    ref={refCallbacks[index]}
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={1}
                                    value={otpInputs.values[index] || ''}
                                    onChange={(e) => handleInputChange(index, e.target.value)}
                                    onKeyDown={(e) => otpInputs.handleKeyDown(index, e)}
                                    onPaste={otpInputs.handlePaste}
                                    disabled={isVerifying || isLoading}
                                    // eslint-disable-next-line jsx-a11y/no-autofocus -- focus first digit on modal open (WCAG 2.4.3 focus order); dialog is the exception the rule warns about
                                    autoFocus={index === 0}
                                    className="w-full min-w-0 h-14 text-center text-sm font-bold border-2"
                                    aria-label={`${t('otpCodeLabel')} ${index + 1} of ${visibleCount}`}
                                />
                            )
                        )}
                    </div>
                    {error && error.trim() !== '' && (
                        <p className="text-destructive text-sm text-left w-full">{error}</p>
                    )}
                    {isVerifying && (
                        <Typography variant="small" className="text-primary text-center">
                            {t('verifying')}
                        </Typography>
                    )}
                    <div className="flex gap-4 w-full justify-center">
                        {onCheckoutAsGuest && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleCheckoutAsGuest}
                                disabled={isVerifying || isLoading}
                                size="lg"
                                className="min-w-[160px] bg-muted hover:bg-muted/80 text-foreground font-semibold">
                                {t('checkoutAsGuest')}
                            </Button>
                        )}
                        {onResendCode && (
                            <Button
                                type="button"
                                onClick={() => {
                                    void handleResend();
                                }}
                                disabled={isResendDisabled}
                                size="lg"
                                className="min-w-[160px]"
                                variant={isResendDisabled ? 'secondary' : 'default'}>
                                {resendTimer > 0 ? t('resendCodeTimer', { timer: resendTimer }) : t('resendCode')}
                            </Button>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
