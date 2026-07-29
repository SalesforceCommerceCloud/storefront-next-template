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
import { useCallback, useRef, useState } from 'react';
import { resourceRoutes } from '@/route-paths';
import { bufferToBase64Url } from '@/lib/auth/webauthn';
import type { ShopperLogin } from '@/scapi';

export interface PasskeyLoginSuccess {
    tokenResponse: ShopperLogin.schemas['TokenResponse'];
    wishlistMerge?: 'success' | 'partial';
}

/**
 * Client hook for WebAuthn passkey authentication (login) via conditional mediation —
 * the browser surfaces matching passkeys as autofill suggestions on a
 * `autoComplete="username webauthn"` input, with no dedicated UI of our own.
 *
 * Callers invoke `loginWithPasskey()` once conditional mediation should become active
 * (on mount for the login page, on email blur for checkout contact-info — see the callers).
 * The returned promise resolves once the ceremony completes, is dismissed, or is aborted;
 * `onSuccess` fires only on a completed, server-confirmed login.
 *
 * `navigator.credentials.get({mediation: 'conditional'})` can stay pending indefinitely
 * (it resolves only when the shopper picks a suggestion, or never). `isAuthenticating`
 * therefore does NOT cover that passive listening window — it flips true only once the
 * shopper has picked a credential and the finish-authentication round trip is in flight,
 * mirroring how `isSendingOtp` covers the passwordless-email network call, not the time
 * spent waiting for the shopper to act.
 *
 * `onError` fires only for failures *after* the shopper has committed a gesture (picked a
 * passkey suggestion) — a failed finish-authentication round trip. The passive pre-gesture
 * paths (dismissed suggestion, no credential, browser without support) stay silent because
 * the shopper never asked to sign in with a passkey, so there is nothing to report.
 */
export function usePasskeyLogin(onSuccess?: (result: PasskeyLoginSuccess) => void, onError?: () => void) {
    const onSuccessRef = useRef(onSuccess);
    onSuccessRef.current = onSuccess;
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;

    const abortControllerRef = useRef<AbortController | null>(null);
    const inFlightRef = useRef(false);
    const [isAuthenticating, setIsAuthenticating] = useState(false);

    const abortPasskeyLogin = useCallback(() => {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        inFlightRef.current = false;
        setIsAuthenticating(false);
    }, []);

    const loginWithPasskey = useCallback(async (): Promise<void> => {
        if (typeof window === 'undefined' || inFlightRef.current) return;
        if (
            typeof window.PublicKeyCredential === 'undefined' ||
            typeof window.PublicKeyCredential.isConditionalMediationAvailable !== 'function' ||
            // parseRequestOptionsFromJSON is the standards-track deserializer for the SLAS
            // options payload. Without it we'd have to hand-decode base64url challenge/allowCredentials
            // fields, and a raw cast of the JSON to PublicKeyCredentialRequestOptions passes strings
            // where the API demands ArrayBuffers — navigator.credentials.get then throws a TypeError
            // mid-ceremony. Treat its absence as "passkey login unsupported" and bail before starting.
            typeof window.PublicKeyCredential.parseRequestOptionsFromJSON !== 'function'
        ) {
            return;
        }

        // Set synchronously (before the first await) so two calls fired back-to-back
        // in the same tick can't both pass the inFlightRef guard above.
        inFlightRef.current = true;

        const isConditionalMediationAvailable = await window.PublicKeyCredential.isConditionalMediationAvailable();
        if (!isConditionalMediationAvailable) {
            inFlightRef.current = false;
            return;
        }

        // A prior in-flight call was already aborted via abortPasskeyLogin — start fresh.
        abortControllerRef.current?.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;

        // Flips true once the shopper picks a passkey suggestion. Gates onError so only
        // post-gesture failures are surfaced; pre-gesture network hiccups (e.g. the
        // start-authentication fetch) stay silent, matching the passive-listening contract.
        let gestureCommitted = false;

        try {
            const startRes = await fetch(resourceRoutes.passkeyStartAuthentication, {
                method: 'POST',
                signal: controller.signal,
            });
            const startData = (await startRes.json()) as {
                success: boolean;
                publicKey?: Record<string, unknown>;
            };
            if (!startRes.ok || !startData.success || !startData.publicKey) return;

            // SLAS returns rpId as a comma-separated list when multiple RP IDs are configured.
            // The WebAuthn spec requires a single registrable domain — pick the entry matching
            // the current hostname (exact match or parent-domain suffix).
            const publicKey = { ...startData.publicKey } as Record<string, unknown>;
            if (typeof publicKey.rpId === 'string' && publicKey.rpId.includes(',')) {
                const currentHost = window.location.hostname;
                const matched = publicKey.rpId
                    .split(',')
                    .map((s) => s.trim())
                    .find((id) => currentHost === id || currentHost.endsWith(`.${id}`));
                if (matched) {
                    publicKey.rpId = matched;
                } else {
                    // None of the configured RP IDs match this hostname. Passing the raw
                    // comma-separated string to parseRequestOptionsFromJSON/credentials.get would
                    // throw (invalid registrable domain). This runs before the shopper commits a
                    // gesture, so bail silently per the passive-listening contract rather than
                    // surfacing an error for a suggestion they never picked. The finally block
                    // clears inFlightRef and the abort controller.
                    return;
                }
            }

            // Presence guaranteed by the capability gate at the top of loginWithPasskey.
            const requestOptions = window.PublicKeyCredential.parseRequestOptionsFromJSON(
                publicKey as unknown as PublicKeyCredentialRequestOptionsJSON
            );

            let credential: PublicKeyCredential;
            try {
                const cred = await navigator.credentials.get({
                    publicKey: requestOptions,
                    mediation: 'conditional',
                    signal: controller.signal,
                });
                if (!cred || cred.type !== 'public-key') return;
                credential = cred as PublicKeyCredential;
            } catch (err) {
                // AbortError: caller cancelled (unmount, step exit, re-trigger for a new email).
                // NotAllowedError: the shopper dismissed the autofill suggestion or no credential
                // was available. Neither is a failure worth surfacing.
                if (err instanceof Error && (err.name === 'AbortError' || err.name === 'NotAllowedError')) return;
                return;
            }

            // The shopper picked a passkey suggestion — only now does the flow become a
            // brief, bounded network round trip worth reflecting as a pending state.
            gestureCommitted = true;
            setIsAuthenticating(true);

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
                                  (credential.response as AuthenticatorAssertionResponse).clientDataJSON
                              ),
                              authenticatorData: bufferToBase64Url(
                                  (credential.response as AuthenticatorAssertionResponse).authenticatorData
                              ),
                              signature: bufferToBase64Url(
                                  (credential.response as AuthenticatorAssertionResponse).signature
                              ),
                              userHandle: (credential.response as AuthenticatorAssertionResponse).userHandle
                                  ? bufferToBase64Url(
                                        (credential.response as AuthenticatorAssertionResponse)
                                            .userHandle as ArrayBuffer
                                    )
                                  : undefined,
                          },
                      };

            const finishRes = await fetch(resourceRoutes.passkeyFinishAuthentication, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential: credentialJson }),
                signal: controller.signal,
            });
            const finishData = (await finishRes.json()) as {
                success: boolean;
                tokenResponse?: ShopperLogin.schemas['TokenResponse'];
                wishlistMerge?: 'success' | 'partial';
            };

            if (!finishRes.ok || !finishData.success || !finishData.tokenResponse) {
                // The shopper committed a gesture and picked a passkey, but the server could not
                // complete the login. Unlike the passive pre-gesture paths, this is a visible
                // failure worth surfacing so the caller can show an error rather than leaving the
                // shopper staring at an unchanged sign-in screen with no feedback.
                onErrorRef.current?.();
                return;
            }

            onSuccessRef.current?.({
                tokenResponse: finishData.tokenResponse,
                wishlistMerge: finishData.wishlistMerge,
            });
        } catch (err) {
            // AbortError is a caller-initiated cancel, never a real failure — stay silent.
            if (err instanceof Error && err.name === 'AbortError') return;
            // A thrown error here (network drop parsing/sending the finish request, etc.) is only
            // worth surfacing once the shopper has committed a gesture; pre-gesture failures stay
            // silent, consistent with the passive-listening contract.
            if (gestureCommitted) {
                onErrorRef.current?.();
            }
        } finally {
            inFlightRef.current = false;
            abortControllerRef.current = null;
            setIsAuthenticating(false);
        }
    }, []);

    return { loginWithPasskey, abortPasskeyLogin, isAuthenticating };
}
