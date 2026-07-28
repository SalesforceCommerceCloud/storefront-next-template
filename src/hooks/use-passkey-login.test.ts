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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { usePasskeyLogin } from './use-passkey-login';

function stubConditionalMediation(available = true) {
    vi.stubGlobal('PublicKeyCredential', {
        isConditionalMediationAvailable: vi.fn().mockResolvedValue(available),
        // The hook now requires this deserializer as a support signal; pass the JSON through
        // so the shape the real API returns (an object with a `publicKey`) still reaches
        // navigator.credentials.get in tests.
        parseRequestOptionsFromJSON: vi.fn((json: unknown) => json),
    });
}

function stubCredentialsGet(implementation: (...args: unknown[]) => Promise<unknown>) {
    vi.stubGlobal('navigator', {
        ...navigator,
        credentials: { get: vi.fn().mockImplementation(implementation) },
    });
}

function mockFetchByUrl(handlers: Record<string, () => Response>) {
    vi.spyOn(global, 'fetch').mockImplementation((input) => {
        const url = typeof input === 'string' ? input : (input as Request).url;
        const match = Object.entries(handlers).find(([key]) => url.includes(key));
        return Promise.resolve(match ? match[1]() : new Response('{}', { status: 200 }));
    });
}

describe('usePasskeyLogin', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('does nothing when the browser does not support conditional mediation', async () => {
        vi.stubGlobal('PublicKeyCredential', {});
        vi.spyOn(global, 'fetch');

        const { result } = renderHook(() => usePasskeyLogin());
        await act(async () => {
            await result.current.loginWithPasskey();
        });

        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('does nothing when the browser lacks parseRequestOptionsFromJSON', async () => {
        vi.stubGlobal('PublicKeyCredential', {
            isConditionalMediationAvailable: vi.fn().mockResolvedValue(true),
            // No parseRequestOptionsFromJSON — a raw cast would pass strings where the API
            // demands ArrayBuffers, so the hook must treat this as unsupported and never fetch.
        });
        vi.spyOn(global, 'fetch');

        const { result } = renderHook(() => usePasskeyLogin());
        await act(async () => {
            await result.current.loginWithPasskey();
        });

        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('does nothing when conditional mediation is unavailable', async () => {
        stubConditionalMediation(false);
        vi.spyOn(global, 'fetch');

        const { result } = renderHook(() => usePasskeyLogin());
        await act(async () => {
            await result.current.loginWithPasskey();
        });

        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('fetches start-authentication and calls navigator.credentials.get with conditional mediation', async () => {
        stubConditionalMediation(true);
        mockFetchByUrl({
            'passkey-start-authentication': () =>
                new Response(JSON.stringify({ success: true, publicKey: { challenge: 'abc', rpId: 'example.com' } }), {
                    status: 200,
                }),
        });
        const getCredential = vi.fn().mockImplementation(() => new Promise(() => {}));
        stubCredentialsGet(getCredential);

        const { result } = renderHook(() => usePasskeyLogin());
        act(() => {
            void result.current.loginWithPasskey();
        });

        await waitFor(() => expect(getCredential).toHaveBeenCalledTimes(1));
        const [options] = getCredential.mock.calls[0];
        expect(options.mediation).toBe('conditional');
        expect(options.publicKey).toBeDefined();
    });

    it('picks the matching entry from a comma-separated rpId list before calling get', async () => {
        stubConditionalMediation(true);
        mockFetchByUrl({
            'passkey-start-authentication': () =>
                new Response(
                    JSON.stringify({
                        success: true,
                        publicKey: { challenge: 'abc', rpId: 'other.com,example.com,extra.com' },
                    }),
                    { status: 200 }
                ),
        });
        vi.stubGlobal('location', { ...window.location, hostname: 'shop.example.com' });
        const getCredential = vi.fn().mockImplementation(() => new Promise(() => {}));
        stubCredentialsGet(getCredential);

        const { result } = renderHook(() => usePasskeyLogin());
        act(() => {
            void result.current.loginWithPasskey();
        });

        await waitFor(() => expect(getCredential).toHaveBeenCalledTimes(1));
        const [options] = getCredential.mock.calls[0];
        // Parent-domain suffix match wins; the raw comma-list must never reach the WebAuthn API.
        expect(options.publicKey.rpId).toBe('example.com');
    });

    it('bails silently (no get, no onError) when no rpId entry matches the hostname', async () => {
        stubConditionalMediation(true);
        mockFetchByUrl({
            'passkey-start-authentication': () =>
                new Response(
                    JSON.stringify({ success: true, publicKey: { challenge: 'abc', rpId: 'foo.com,bar.com' } }),
                    { status: 200 }
                ),
        });
        vi.stubGlobal('location', { ...window.location, hostname: 'shop.example.com' });
        const getCredential = vi.fn().mockImplementation(() => new Promise(() => {}));
        stubCredentialsGet(getCredential);

        const onError = vi.fn();
        const { result } = renderHook(() => usePasskeyLogin(undefined, onError));
        await act(async () => {
            await result.current.loginWithPasskey();
        });

        // Passing the raw comma-list to the WebAuthn API would throw; the hook must bail before
        // reaching it. This is pre-gesture, so nothing is surfaced to the shopper.
        expect(getCredential).not.toHaveBeenCalled();
        expect(onError).not.toHaveBeenCalled();
        expect(result.current.isAuthenticating).toBe(false);
    });

    it('does not set isAuthenticating while conditional mediation is passively listening', async () => {
        stubConditionalMediation(true);
        mockFetchByUrl({
            'passkey-start-authentication': () =>
                new Response(JSON.stringify({ success: true, publicKey: { challenge: 'abc' } }), { status: 200 }),
        });
        // Never resolves — simulates the passive autofill-listening window.
        stubCredentialsGet(() => new Promise(() => {}));

        const { result } = renderHook(() => usePasskeyLogin());
        act(() => {
            void result.current.loginWithPasskey();
        });

        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
        expect(result.current.isAuthenticating).toBe(false);
    });

    it('silently ignores NotAllowedError (dismissed suggestion)', async () => {
        stubConditionalMediation(true);
        mockFetchByUrl({
            'passkey-start-authentication': () =>
                new Response(JSON.stringify({ success: true, publicKey: { challenge: 'abc' } }), { status: 200 }),
        });
        const notAllowedError = new Error('User dismissed');
        notAllowedError.name = 'NotAllowedError';
        stubCredentialsGet(() => Promise.reject(notAllowedError));

        const onSuccess = vi.fn();
        const { result } = renderHook(() => usePasskeyLogin(onSuccess));
        await act(async () => {
            await result.current.loginWithPasskey();
        });

        expect(onSuccess).not.toHaveBeenCalled();
        expect(result.current.isAuthenticating).toBe(false);
    });

    it('silently ignores AbortError', async () => {
        stubConditionalMediation(true);
        mockFetchByUrl({
            'passkey-start-authentication': () =>
                new Response(JSON.stringify({ success: true, publicKey: { challenge: 'abc' } }), { status: 200 }),
        });
        const abortError = new Error('Aborted');
        abortError.name = 'AbortError';
        stubCredentialsGet(() => Promise.reject(abortError));

        const onSuccess = vi.fn();
        const { result } = renderHook(() => usePasskeyLogin(onSuccess));
        await act(async () => {
            await result.current.loginWithPasskey();
        });

        expect(onSuccess).not.toHaveBeenCalled();
    });

    it('completes the full login flow and calls onSuccess with the token response', async () => {
        stubConditionalMediation(true);
        const credential = {
            id: 'cred-1',
            type: 'public-key',
            toJSON: () => ({ id: 'cred-1', type: 'public-key' }),
        };
        stubCredentialsGet(() => Promise.resolve(credential));
        mockFetchByUrl({
            'passkey-start-authentication': () =>
                new Response(JSON.stringify({ success: true, publicKey: { challenge: 'abc' } }), { status: 200 }),
            'passkey-finish-authentication': () =>
                new Response(
                    JSON.stringify({
                        success: true,
                        tokenResponse: { access_token: 'access-token' },
                        wishlistMerge: 'success',
                    }),
                    { status: 200 }
                ),
        });

        const onSuccess = vi.fn();
        const { result } = renderHook(() => usePasskeyLogin(onSuccess));
        await act(async () => {
            await result.current.loginWithPasskey();
        });

        expect(onSuccess).toHaveBeenCalledWith({
            tokenResponse: { access_token: 'access-token' },
            wishlistMerge: 'success',
        });
        expect(result.current.isAuthenticating).toBe(false);

        const finishCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(([input]) => {
            const url = typeof input === 'string' ? input : (input as Request).url;
            return url.includes('passkey-finish-authentication');
        });
        const finishBody = JSON.parse(finishCall?.[1]?.body as string);
        expect(finishBody.credential).toEqual({ id: 'cred-1', type: 'public-key' });
    });

    it('falls back to manual base64url encoding when the credential has no toJSON', async () => {
        stubConditionalMediation(true);
        const toArrayBuffer = (bytes: number[]) => new Uint8Array(bytes).buffer;
        // Bytes chosen so standard base64 would contain `+`, `/`, and padding `=`, letting
        // the assertions below tell base64url output apart from plain base64.
        const clientDataJSON = toArrayBuffer([0xfb, 0xff, 0xbf]);
        const credential = {
            id: 'cred-1',
            rawId: toArrayBuffer([0xfb, 0xff, 0xbf]),
            type: 'public-key',
            getClientExtensionResults: () => ({}),
            response: {
                clientDataJSON,
                authenticatorData: toArrayBuffer([1, 2, 3]),
                signature: toArrayBuffer([4, 5, 6]),
                userHandle: toArrayBuffer([7, 8, 9]),
            },
        };
        stubCredentialsGet(() => Promise.resolve(credential));
        mockFetchByUrl({
            'passkey-start-authentication': () =>
                new Response(JSON.stringify({ success: true, publicKey: { challenge: 'abc' } }), { status: 200 }),
            'passkey-finish-authentication': () =>
                new Response(JSON.stringify({ success: true, tokenResponse: { access_token: 'access-token' } }), {
                    status: 200,
                }),
        });

        const { result } = renderHook(() => usePasskeyLogin());
        await act(async () => {
            await result.current.loginWithPasskey();
        });

        const finishCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(([input]) => {
            const url = typeof input === 'string' ? input : (input as Request).url;
            return url.includes('passkey-finish-authentication');
        });
        const finishBody = JSON.parse(finishCall?.[1]?.body as string);

        expect(finishBody.credential.rawId).toBe('-_-_');
        expect(finishBody.credential.response.clientDataJSON).toBe('-_-_');
        for (const value of Object.values(finishBody.credential.response)) {
            expect(value).not.toMatch(/[+/=]/);
        }
    });

    it('calls onError (not onSuccess) when finish-authentication returns success: false after a gesture', async () => {
        stubConditionalMediation(true);
        const credential = {
            id: 'cred-1',
            type: 'public-key',
            toJSON: () => ({ id: 'cred-1', type: 'public-key' }),
        };
        stubCredentialsGet(() => Promise.resolve(credential));
        mockFetchByUrl({
            'passkey-start-authentication': () =>
                new Response(JSON.stringify({ success: true, publicKey: { challenge: 'abc' } }), { status: 200 }),
            'passkey-finish-authentication': () => new Response(JSON.stringify({ success: false }), { status: 500 }),
        });

        const onSuccess = vi.fn();
        const onError = vi.fn();
        const { result } = renderHook(() => usePasskeyLogin(onSuccess, onError));
        await act(async () => {
            await result.current.loginWithPasskey();
        });

        expect(onSuccess).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledTimes(1);
    });

    it('does not call onError for a dismissed suggestion (pre-gesture)', async () => {
        stubConditionalMediation(true);
        mockFetchByUrl({
            'passkey-start-authentication': () =>
                new Response(JSON.stringify({ success: true, publicKey: { challenge: 'abc' } }), { status: 200 }),
        });
        const notAllowedError = new Error('User dismissed');
        notAllowedError.name = 'NotAllowedError';
        stubCredentialsGet(() => Promise.reject(notAllowedError));

        const onError = vi.fn();
        const { result } = renderHook(() => usePasskeyLogin(undefined, onError));
        await act(async () => {
            await result.current.loginWithPasskey();
        });

        expect(onError).not.toHaveBeenCalled();
    });

    it('does not start a second ceremony while one is already in flight', async () => {
        stubConditionalMediation(true);
        mockFetchByUrl({
            'passkey-start-authentication': () =>
                new Response(JSON.stringify({ success: true, publicKey: { challenge: 'abc' } }), { status: 200 }),
        });
        stubCredentialsGet(() => new Promise(() => {}));

        const { result } = renderHook(() => usePasskeyLogin());
        act(() => {
            void result.current.loginWithPasskey();
            void result.current.loginWithPasskey();
        });

        await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    });

    it('abortPasskeyLogin aborts the in-flight ceremony and resets isAuthenticating', async () => {
        stubConditionalMediation(true);
        mockFetchByUrl({
            'passkey-start-authentication': () =>
                new Response(JSON.stringify({ success: true, publicKey: { challenge: 'abc' } }), { status: 200 }),
        });
        let capturedSignal: AbortSignal | undefined;
        stubCredentialsGet((options: any) => {
            capturedSignal = options.signal;
            return new Promise(() => {});
        });

        const { result } = renderHook(() => usePasskeyLogin());
        act(() => {
            void result.current.loginWithPasskey();
        });

        await waitFor(() => expect(capturedSignal).toBeDefined());
        act(() => {
            result.current.abortPasskeyLogin();
        });

        expect(capturedSignal?.aborted).toBe(true);
        expect(result.current.isAuthenticating).toBe(false);
    });
});
