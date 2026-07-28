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
import { type ReactElement, useState, useEffect, useCallback, useRef } from 'react';
import { useRevalidator } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Typography } from '@/components/typography';
import { useOtpVerification } from '@/hooks/use-otp-verification';
import { toast } from '@/components/toast';
import { useNavigate } from '@/hooks/use-navigate';
import { routes } from '@/route-paths';
import { bufferToBase64Url } from '@/lib/auth/webauthn';

// SLAS issues OTPs in the 6-to-8-digit range (pwd_action_token: ^[0-9]{6,8}$). Mirrors
// OtpModal's constants: `config.auth.otpLength` is the storefront's configured guess at the
// length, but SLAS owns what it actually sends, so the two can drift. The modal renders
// `otpLength` slots initially and expands toward MAX_OTP_LENGTH when a longer code is pasted.
const MIN_OTP_LENGTH = 6;
const MAX_OTP_LENGTH = 8;

// SCAPI's RegistrationStartRequest.nick_name schema caps the nickname at 128 chars. Enforce it
// before advancing so the shopper isn't sent through OTP only to hit a generic failure at /start.
const MAX_NICKNAME_LENGTH = 128;

type Step = 'name' | 'otp';

interface PasskeyRegistrationModalProps {
    open: boolean;
    userId: string;
    onClose: () => void;
    /** Skip the "Passkey was added" success toast — the caller's own UI already confirms it (e.g. the passkeys management page, where the new passkey appears in the list). */
    suppressSuccessToast?: boolean;
}

/**
 * Modal that guides a user through passkey registration after login/signup.
 * Flow: name entry → authorize (sends OTP email once a name is chosen) → OTP entry
 * (auto-submits on fill) → start (get publicKey, tagged with the chosen nickname) →
 * navigator.credentials.create() → finish (send credential to SLAS).
 */
export function PasskeyRegistrationModal({
    open,
    userId,
    onClose,
    suppressSuccessToast,
}: PasskeyRegistrationModalProps): ReactElement {
    const { t } = useTranslation('account');
    const { t: tLogin } = useTranslation('login');
    const navigate = useNavigate();
    const revalidator = useRevalidator();
    const config = useConfig();
    const otpLength = (config.auth as { otpLength?: number } | undefined)?.otpLength ?? 6;
    const [step, setStep] = useState<Step>('name');
    const [nickName, setNickName] = useState('');
    const [nameError, setNameError] = useState<string | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resendTimer, setResendTimer] = useState(0);

    // Delivery mode (email vs. callback) is a server-side decision driven by
    // features.passkey.mode — the client just triggers the send.
    const sendOtp = useCallback(() => {
        fetch('/action/passkey-authorize-registration', { method: 'POST' })
            .then(async (res) => {
                const data = (await res.json()) as { success: boolean };
                if (!res.ok || !data.success) {
                    setError(t('passkeys.addError'));
                }
            })
            .catch(() => {
                setError(t('passkeys.addError'));
            });
    }, [t]);

    // Deduplicate sendOtp per modal-open. React 19 Strict Mode double-invokes effects in
    // dev; this ref survives the artificial unmount/remount so only one OTP is issued.
    const otpIssuedRef = useRef(false);

    const { otpInputs, otpInputsRef, refCallbacks } = useOtpVerification({ slotCount: MAX_OTP_LENGTH });

    // Resend countdown
    useEffect(() => {
        if (resendTimer > 0) {
            const timer = setTimeout(() => setResendTimer((prev) => prev - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [resendTimer]);

    const handleResend = useCallback(() => {
        if (resendTimer > 0 || isVerifying) return;
        setResendTimer(5);
        otpIssuedRef.current = false;
        sendOtp();
        otpIssuedRef.current = true;
        otpInputsRef.current.clear();
        setError(null);
        requestAnimationFrame(() => {
            otpInputsRef.current.inputRefs.current[0]?.focus();
        });
    }, [resendTimer, isVerifying, sendOtp, otpInputsRef]);

    // Reset to the name step and clear transient state each time the modal opens.
    useEffect(() => {
        if (!open) {
            otpIssuedRef.current = false;
            return;
        }
        setStep('name');
        setNickName('');
        setNameError(null);
        setError(null);
        setIsVerifying(false);
        otpInputsRef.current.clear();
    }, [open, otpInputsRef]);

    // Once the shopper names the passkey and advances to the OTP step, send the email code.
    useEffect(() => {
        if (!open || !userId || step !== 'otp' || otpIssuedRef.current) return;
        otpIssuedRef.current = true;
        sendOtp();

        requestAnimationFrame(() => {
            otpInputsRef.current.inputRefs.current[0]?.focus();
        });
    }, [open, userId, step, otpInputsRef, sendOtp]);

    const handleNameContinue = useCallback(() => {
        const trimmed = nickName.trim();
        if (!trimmed) {
            setNameError(t('passkeys.nameRequired'));
            return;
        }
        if (trimmed.length > MAX_NICKNAME_LENGTH) {
            setNameError(t('passkeys.nameTooLong'));
            return;
        }
        setNameError(null);
        setStep('otp');
    }, [nickName, t]);

    const handleVerify = useCallback(
        async (code: string) => {
            setError(null);
            setIsVerifying(true);

            try {
                // Step 1: start registration — get publicKey options from server
                const startFormData = new FormData();
                startFormData.append('pwdActionToken', code);
                if (nickName.trim()) {
                    startFormData.append('nickName', nickName.trim());
                }

                const startRes = await fetch('/action/passkey-start-registration', {
                    method: 'POST',
                    body: startFormData,
                });
                const startData = (await startRes.json()) as {
                    success: boolean;
                    publicKey?: Record<string, unknown>;
                    error?: unknown;
                };

                if (!startRes.ok || !startData.success || !startData.publicKey) {
                    setError(t('passkeys.addError'));
                    setIsVerifying(false);
                    otpInputsRef.current.clear();
                    return;
                }

                // SLAS returns rp.id as a comma-separated list when multiple RP IDs are configured.
                // The WebAuthn spec requires a single registrable domain — pick the entry matching
                // the current hostname (exact match or parent-domain suffix).
                const publicKey = { ...startData.publicKey } as Record<string, unknown>;
                const rp = publicKey.rp as Record<string, unknown> | undefined;
                if (rp && typeof rp.id === 'string' && rp.id.includes(',')) {
                    const currentHost = window.location.hostname;
                    const matched = rp.id
                        .split(',')
                        .map((s) => s.trim())
                        .find((id) => currentHost === id || currentHost.endsWith(`.${id}`));
                    if (matched) {
                        publicKey.rp = { ...rp, id: matched };
                    } else {
                        // None of the configured RP IDs match this hostname — the browser's WebAuthn
                        // API would reject the raw comma-separated id as an invalid registrable domain.
                        // Bail out now instead of surfacing a misleading "try again" prompt.
                        // oxlint-disable-next-line no-console
                        console.error('PasskeyRegistration: no rp.id entry matches current hostname', {
                            rpId: rp.id,
                            currentHost,
                        });
                        setError(t('passkeys.addError'));
                        setIsVerifying(false);
                        otpInputsRef.current.clear();
                        return;
                    }
                }

                // Step 2: browser WebAuthn — create credential using server-issued options.
                // `parseCreationOptionsFromJSON` decodes SLAS's base64url challenge/user.id into the
                // BufferSources `navigator.credentials.create()` requires. Both registration entry
                // points (Add button, upsell toast) are gated on `isPasskeyRegistrationSupported()`,
                // which requires this method, so it's guaranteed present here — no fallback needed.
                let credential: PublicKeyCredential;
                try {
                    const creationOptions = PublicKeyCredential.parseCreationOptionsFromJSON(
                        publicKey as unknown as PublicKeyCredentialCreationOptionsJSON
                    );

                    const cred = await navigator.credentials.create({
                        publicKey: creationOptions,
                    });
                    if (!cred || cred.type !== 'public-key') {
                        setIsVerifying(false);
                        otpInputsRef.current.clear();
                        return;
                    }
                    credential = cred as PublicKeyCredential;
                } catch (err) {
                    if (err instanceof Error && err.name !== 'NotAllowedError') {
                        setError(t('passkeys.addError'));
                    }
                    setIsVerifying(false);
                    otpInputsRef.current.clear();
                    return;
                }

                // Step 3: serialize credential (toJSON with manual fallback)
                const credentialJson: Record<string, unknown> =
                    typeof (credential as unknown as { toJSON?: () => Record<string, unknown> }).toJSON === 'function'
                        ? (credential as unknown as { toJSON: () => Record<string, unknown> }).toJSON()
                        : {
                              id: credential.id,
                              rawId: bufferToBase64Url(credential.rawId),
                              type: credential.type,
                              clientExtensionResults: credential.getClientExtensionResults(),
                              response: {
                                  clientDataJSON: bufferToBase64Url(
                                      (credential.response as AuthenticatorAttestationResponse).clientDataJSON
                                  ),
                                  attestationObject: bufferToBase64Url(
                                      (credential.response as AuthenticatorAttestationResponse).attestationObject
                                  ),
                              },
                          };

                // Step 4: finish registration
                const finishRes = await fetch('/action/passkey-finish-registration', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ credential: credentialJson, pwdActionToken: code }),
                });
                const finishData = (await finishRes.json()) as { success: boolean };

                if (!finishRes.ok || !finishData.success) {
                    setError(t('passkeys.addError'));
                    setIsVerifying(false);
                    otpInputsRef.current.clear();
                    return;
                }

                // Success: close modal, refresh passkey status (the upsell hook's fetcher would
                // otherwise keep serving its stale pre-registration hasPasskey:false), and show toast.
                // Must clear the OTP inputs like every other exit path — the modal component stays
                // mounted after onClose() (only the `open` prop flips), so leaving enteredOtp full
                // would re-trigger the auto-submit effect once isVerifying flips back to false below.
                setIsVerifying(false);
                otpInputsRef.current.clear();
                onClose();
                void revalidator.revalidate();
                if (!suppressSuccessToast) {
                    toast.success(t('passkeys.addSuccess'), {
                        description: t('passkeys.addSuccessDescription'),
                        duration: 5000,
                        closeButton: true,
                        className: 'passkey-success-toast',
                        action: {
                            label: t('passkeys.viewPasskeys'),
                            onClick: () => {
                                void navigate(routes.accountPasskeys);
                            },
                        },
                    });
                }
            } catch {
                setError(t('passkeys.addError'));
                setIsVerifying(false);
                otpInputsRef.current.clear();
            }
        },
        [otpInputsRef, t, onClose, navigate, revalidator, nickName, suppressSuccessToast]
    );

    const enteredOtp = otpInputs.values.join('');
    const visibleCount = Math.min(Math.max(otpLength, enteredOtp.length), MAX_OTP_LENGTH);
    const hasGap = otpInputs.values.some((value, index) => value === '' && index < enteredOtp.length);

    // Auto-submit once all visible slots are filled — mirrors OtpModal behavior
    useEffect(() => {
        if (
            step === 'otp' &&
            enteredOtp.length === visibleCount &&
            enteredOtp.length >= MIN_OTP_LENGTH &&
            !hasGap &&
            !isVerifying
        ) {
            void handleVerify(enteredOtp);
        }
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [step, enteredOtp, visibleCount, hasGap, isVerifying]);

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                if (!v && !isVerifying) onClose();
            }}>
            <DialogContent data-testid="passkey-registration-modal" className="sm:max-w-lg [&>button]:cursor-pointer">
                {step === 'name' ? (
                    <>
                        <DialogHeader>
                            <DialogTitle>{t('passkeys.addDialogTitle')}</DialogTitle>
                            <DialogDescription>{t('passkeys.addDialogDescription')}</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-2">
                            <label htmlFor="passkey-name" className="text-sm font-medium text-foreground">
                                {t('passkeys.passkeyNameLabel')}
                            </label>
                            <Input
                                id="passkey-name"
                                value={nickName}
                                onChange={(e) => {
                                    setNickName(e.target.value);
                                    if (nameError) setNameError(null);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleNameContinue();
                                }}
                                placeholder={t('passkeys.passkeyNamePlaceholder')}
                                aria-invalid={nameError ? true : undefined}
                                aria-describedby={nameError ? 'passkey-name-error' : 'passkey-name-hint'}
                                // oxlint-disable-next-line jsx-a11y/no-autofocus -- focus name field on modal open (WCAG 2.4.3 focus order); dialog is the exception the rule warns about
                                autoFocus
                            />
                            {nameError ? (
                                <p id="passkey-name-error" className="text-destructive text-sm" role="alert">
                                    {nameError}
                                </p>
                            ) : (
                                <p id="passkey-name-hint" className="text-sm text-muted-foreground">
                                    {t('passkeys.passkeyNameHint')}
                                </p>
                            )}
                        </div>
                        <div className="flex justify-end pt-4">
                            <Button type="button" onClick={handleNameContinue}>
                                {t('passkeys.addContinue')}
                            </Button>
                        </div>
                    </>
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle>{t('passkeys.otpStepTitle')}</DialogTitle>
                            <DialogDescription>{t('passkeys.otpStepDescription', { otpLength })}</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-6 flex flex-col items-center w-full">
                            <div
                                className="grid gap-3 w-full justify-center"
                                style={{ gridTemplateColumns: `repeat(${visibleCount}, minmax(0, 3rem))` }}>
                                {Array.from({ length: visibleCount }, (_, index) => `passkey-otp-${index}`).map(
                                    (inputId, index) => (
                                        <Input
                                            key={inputId}
                                            ref={refCallbacks[index]}
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={1}
                                            value={otpInputs.values[index] || ''}
                                            onChange={(e) => {
                                                otpInputs.setValue(index, e.target.value);
                                                setError(null);
                                            }}
                                            onKeyDown={(e) => otpInputs.handleKeyDown(index, e)}
                                            onPaste={otpInputs.handlePaste}
                                            disabled={isVerifying}
                                            // oxlint-disable-next-line jsx-a11y/no-autofocus -- focus first digit on modal open (WCAG 2.4.3 focus order); dialog is the exception the rule warns about
                                            autoFocus={index === 0}
                                            className="w-full min-w-0 h-14 text-center text-sm font-bold border-2"
                                            aria-label={`${t('passkeys.otpCodeLabel')} ${index + 1} of ${visibleCount}`}
                                        />
                                    )
                                )}
                            </div>
                            {error && error.trim() !== '' && (
                                <p className="text-destructive text-sm text-left w-full" role="alert">
                                    {error}
                                </p>
                            )}
                            {isVerifying && (
                                <Typography variant="small" className="text-primary text-center" role="status">
                                    {tLogin('verifying')}
                                </Typography>
                            )}
                            <div className="flex gap-4 w-full justify-center">
                                <Button
                                    type="button"
                                    onClick={handleResend}
                                    disabled={resendTimer > 0 || isVerifying}
                                    size="lg"
                                    className="min-w-[160px]"
                                    variant={resendTimer > 0 || isVerifying ? 'secondary' : 'default'}>
                                    {resendTimer > 0
                                        ? tLogin('resendCodeTimer', { timer: resendTimer })
                                        : tLogin('resendCode')}
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
