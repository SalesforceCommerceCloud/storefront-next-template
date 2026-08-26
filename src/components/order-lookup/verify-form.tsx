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

import { useState, useEffect, useRef, useMemo, type ReactElement } from 'react';
import { useFetcher } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { TurnstileWidget } from '@/components/security/turnstile-widget';
import { useOtpVerification } from '@/hooks/use-otp-verification';
import { parseOtp } from '@/lib/order/lookup/validation';
import { getTurnstileSiteKey, isTurnstileEnabled } from '@/lib/turnstile/utils';
import type { VerifyOrderResponse } from '@/routes/action.order-lookup-verify';
import { OrderLookupErrorMessage } from './error-message';

const MAX_OTP_LENGTH = 6;

export interface VerifyFormProps {
    orderNumber: string;
    email: string;
    onVerified: (result: { orderNumber: string; email: string }) => void;
    onCancel?: () => void;
}

export function VerifyForm({ orderNumber, email, onVerified, onCancel }: VerifyFormProps): ReactElement {
    const { t } = useTranslation('orderLookup');
    const config = useConfig();
    const fetcher = useFetcher<VerifyOrderResponse>();
    const [errorCode, setErrorCode] = useState<string | null>(null);
    const [retryAfterSeconds, setRetryAfterSeconds] = useState<number | undefined>(undefined);
    const [clientAttempts, setClientAttempts] = useState(0);
    const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
    const hasCalledOnVerifiedRef = useRef(false);
    const lastHandledDataRef = useRef<VerifyOrderResponse | undefined>(undefined);
    const turnstileResetRef = useRef<(() => void) | null>(null);

    const { otpInputs, otpInputsRef, refCallbacks } = useOtpVerification({
        slotCount: MAX_OTP_LENGTH,
    });

    const turnstileEnabled = config ? isTurnstileEnabled(config) : false;
    const siteKey = useMemo(() => {
        if (!config || !turnstileEnabled) return null;
        if (typeof window !== 'undefined') {
            const baseUrl = `${window.location.protocol}//${window.location.host}`;
            return getTurnstileSiteKey(config, baseUrl);
        }
        return null;
    }, [config, turnstileEnabled]);

    const isLoading = fetcher.state === 'submitting' || fetcher.state === 'loading';
    const enteredOtp = otpInputs.values.join('');
    const isCodeComplete = enteredOtp.length === MAX_OTP_LENGTH;

    // Focus first input on mount
    useEffect(() => {
        requestAnimationFrame(() => {
            const alreadyFocused = otpInputsRef.current.inputRefs.current.some(
                (ref) => ref && ref === document.activeElement
            );
            if (!alreadyFocused) {
                otpInputsRef.current.inputRefs.current[0]?.focus();
            }
        });
    }, [otpInputsRef]);

    // Handle fetcher response. Guarded by lastHandledDataRef so that editing the OTP
    // (which changes enteredOtp, a dependency here) doesn't re-apply a stale response
    // and re-set an error the user just cleared via handleInputChange.
    useEffect(() => {
        if (fetcher.state === 'idle' && fetcher.data && fetcher.data !== lastHandledDataRef.current) {
            lastHandledDataRef.current = fetcher.data;

            if (fetcher.data.ok && !hasCalledOnVerifiedRef.current) {
                hasCalledOnVerifiedRef.current = true;
                setErrorCode(null);
                setRetryAfterSeconds(undefined);
                otpInputsRef.current.clear();
                onVerified({ orderNumber, email });
            } else if (!fetcher.data.ok) {
                const { code, retryAfterSeconds: retry } = fetcher.data;

                setErrorCode(code);
                setRetryAfterSeconds(retry);

                if (code === 'INVALID_CODE') {
                    setClientAttempts((prev) => prev + 1);
                }

                // A Turnstile token is single-use — get a fresh one for the next attempt
                // regardless of why this submission failed.
                setTurnstileToken(null);
                turnstileResetRef.current?.();

                // Focus code input but don't clear - let user see what they entered
                otpInputsRef.current.inputRefs.current[0]?.focus();
            }
        }
    }, [fetcher.state, fetcher.data, enteredOtp, orderNumber, email, onVerified, otpInputsRef]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Client-side validation
        const codeResult = parseOtp(enteredOtp);
        if (!codeResult.ok) {
            setErrorCode('VALIDATION');
            setRetryAfterSeconds(undefined);
            return;
        }

        if (turnstileEnabled && !turnstileToken) {
            return;
        }

        setErrorCode(null);
        setRetryAfterSeconds(undefined);
        hasCalledOnVerifiedRef.current = false;

        const formData = new FormData();
        formData.append('orderNumber', orderNumber);
        formData.append('email', email);
        formData.append('code', enteredOtp);
        if (turnstileEnabled && turnstileToken) {
            formData.append('turnstileToken', turnstileToken);
        }

        void fetcher.submit(formData, {
            method: 'POST',
            action: '/action/order-lookup-verify',
        });
    };

    const handleInputChange = (index: number, value: string) => {
        otpInputs.setValue(index, value);
        setErrorCode(null);
        setRetryAfterSeconds(undefined);
    };

    const showAttemptsHint = clientAttempts >= 3;

    return (
        <Card className="[--ui-border-width:1px]">
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <label htmlFor="otp-input-0" className="text-sm font-medium">
                            {t('verify.codeLabel')}
                        </label>
                        <div
                            className="grid gap-3"
                            style={{ gridTemplateColumns: `repeat(${MAX_OTP_LENGTH}, minmax(0, 3rem))` }}>
                            {Array.from({ length: MAX_OTP_LENGTH }, (_, index) => (
                                <Input
                                    key={`otp-input-${index}`}
                                    id={index === 0 ? 'otp-input-0' : undefined}
                                    ref={refCallbacks[index]}
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={1}
                                    value={otpInputs.values[index] || ''}
                                    onChange={(e) => handleInputChange(index, e.target.value)}
                                    onKeyDown={(e) => otpInputs.handleKeyDown(index, e)}
                                    onPaste={otpInputs.handlePaste}
                                    disabled={isLoading}
                                    autoComplete="one-time-code"
                                    className="w-full min-w-0 h-14 text-center text-sm font-bold border-2"
                                    aria-label={`${String(t('verify.codeLabel'))} ${index + 1} of ${MAX_OTP_LENGTH}`}
                                    aria-invalid={!!errorCode}
                                    aria-describedby={errorCode ? 'verify-error' : undefined}
                                />
                            ))}
                        </div>
                    </div>

                    {errorCode && (
                        <OrderLookupErrorMessage
                            id="verify-error"
                            code={errorCode}
                            retryAfterSeconds={retryAfterSeconds}
                            onRequestNewCode={onCancel}
                            submitBlocking={true}
                        />
                    )}

                    {showAttemptsHint && !errorCode && (
                        <div aria-live="polite" className="text-muted-foreground text-sm">
                            {t('verify.attemptsHint')}
                            {onCancel && (
                                <button
                                    type="button"
                                    onClick={onCancel}
                                    className="ml-2 underline hover:no-underline"
                                    data-testid="attempts-hint-link">
                                    {t('verify.requestNewCode')}
                                </button>
                            )}
                        </div>
                    )}

                    {turnstileEnabled && siteKey && (
                        <TurnstileWidget
                            siteKey={siteKey}
                            onSuccess={setTurnstileToken}
                            onExpire={() => setTurnstileToken(null)}
                            resetRef={turnstileResetRef}
                            enabled={turnstileEnabled}
                        />
                    )}

                    <div className="flex gap-4">
                        {onCancel && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onCancel}
                                disabled={isLoading}
                                className="flex-1">
                                {t('verify.cancelButton')}
                            </Button>
                        )}
                        <Button
                            type="submit"
                            disabled={!isCodeComplete || isLoading || (turnstileEnabled && !turnstileToken)}
                            className="flex-1">
                            {isLoading ? t('verify.verifying') : t('verify.submitButton')}
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}
