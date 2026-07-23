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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import type { ReactNode } from 'react';
import AuthProvider, { useAuth } from './auth';
import { getUserTypeCookieName } from '@/lib/auth/user-type-hint';
import type { PublicSessionData } from '@/lib/api/types';

const SITE_ID = 'RefArchGlobal';
const cookieName = getUserTypeCookieName(SITE_ID);

// The hint is written as base64(JSON) and read via the shared `parseCookie`, so seeded cookies must
// use the same on-the-wire encoding as a real request (matching the currency/basket companion cookies).
const encode = (value: unknown) => btoa(JSON.stringify(value));

// AuthProvider takes siteId as an explicit prop (not from SiteProvider) to resolve the namespaced
// `__sfdc_usertype` hint cookie, so it stays free of a provider-order coupling. Omitting siteId makes
// the hint fallback inert.
const withProviders = (value?: PublicSessionData, siteId: string | undefined = SITE_ID) => {
    const Wrapper = ({ children }: { children: ReactNode }) => (
        <AuthProvider value={value} siteId={siteId}>
            {children}
        </AuthProvider>
    );
    return Wrapper;
};

const clearCookies = () => {
    for (const cookie of document.cookie.split(';')) {
        const name = cookie.split('=')[0]?.trim();
        if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
};

describe('providers/auth.tsx', () => {
    afterEach(() => {
        clearCookies();
    });

    describe('AuthProvider', () => {
        it('should provide session data to children via useAuth hook', () => {
            const mockSessionData: PublicSessionData = {
                customerId: 'test-customer',
                userType: 'registered',
                usid: 'test-usid',
            };

            const { result } = renderHook(() => useAuth(), { wrapper: withProviders(mockSessionData) });

            expect(result.current).toEqual(mockSessionData);
            // PublicSessionData doesn't include accessToken - it's server-only
            expect(result.current?.customerId).toBe('test-customer');
            expect(result.current?.userType).toBe('registered');
        });

        it('should provide undefined when no value is passed and no hint cookie is present', () => {
            const { result } = renderHook(() => useAuth(), { wrapper: withProviders() });

            expect(result.current).toBeUndefined();
        });
    });

    describe('__sfdc_usertype hint fallback', () => {
        it('overrides only userType from the hint cookie, preserving the loader value', () => {
            // Simulates a cached app shell: loader baked in a neutral guest value, but this visitor is
            // actually registered per their own cookie.
            document.cookie = `${cookieName}=${encode('registered')}`;

            const { result } = renderHook(() => useAuth(), {
                wrapper: withProviders({ userType: 'guest', usid: 'loader-usid' }),
            });

            expect(result.current?.userType).toBe('registered');
            // Non-userType fields are untouched — the hint carries userType only.
            expect(result.current?.usid).toBe('loader-usid');
            // customerId is never carried in the hint, so it stays whatever the loader provided (absent here).
            expect(result.current?.customerId).toBeUndefined();
        });

        it('restores userType even when the loader value is undefined (fully cached shell)', () => {
            document.cookie = `${cookieName}=${encode('registered')}`;

            const { result } = renderHook(() => useAuth(), { wrapper: withProviders() });

            expect(result.current).toEqual({ userType: 'registered' });
        });

        it('defers to the loader value when no hint cookie is present', () => {
            const { result } = renderHook(() => useAuth(), {
                wrapper: withProviders({ userType: 'guest' }),
            });

            expect(result.current?.userType).toBe('guest');
        });

        it('ignores a tampered hint value and keeps the loader value', () => {
            // A JS-readable cookie is user-editable; a bad value must never reach an auth branch. Use a
            // well-encoded value so this exercises the validator, not the base64/JSON decode guard.
            document.cookie = `${cookieName}=${encode('admin')}`;

            const { result } = renderHook(() => useAuth(), {
                wrapper: withProviders({ userType: 'guest' }),
            });

            expect(result.current?.userType).toBe('guest');
        });

        it('ignores a hint namespaced for a different site', () => {
            document.cookie = `${getUserTypeCookieName('OtherSite')}=${encode('registered')}`;

            const { result } = renderHook(() => useAuth(), {
                wrapper: withProviders({ userType: 'guest' }),
            });

            expect(result.current?.userType).toBe('guest');
        });

        it('is inert without a siteId, using the loader value verbatim', () => {
            // Mounted with no siteId (e.g. above/without SiteProvider), the fallback cannot resolve the
            // namespaced cookie and must stay off rather than throw.
            document.cookie = `${cookieName}=${encode('registered')}`;

            const { result } = renderHook(() => useAuth(), {
                wrapper: ({ children }: { children: ReactNode }) => (
                    <AuthProvider value={{ userType: 'guest' }}>{children}</AuthProvider>
                ),
            });

            expect(result.current?.userType).toBe('guest');
        });

        it('re-parses when only siteId changes and the cookie header is unchanged', () => {
            // Two site-namespaced hints coexist in one identical document.cookie string. The parse cache
            // must key on siteId, not just the raw header — otherwise a client navigation that flips the
            // active site (without mutating document.cookie) would keep returning the prior site's value.
            document.cookie = `${getUserTypeCookieName('SiteA')}=${encode('guest')}`;
            document.cookie = `${getUserTypeCookieName('SiteB')}=${encode('registered')}`;

            const ShowUserType = () => <span>{useAuth()?.userType ?? 'none'}</span>;
            const Tree = ({ siteId }: { siteId: string }) => (
                <AuthProvider value={{ userType: 'guest' }} siteId={siteId}>
                    <ShowUserType />
                </AuthProvider>
            );

            const { getByText, rerender } = render(<Tree siteId="SiteA" />);
            expect(getByText('guest')).toBeInTheDocument();

            rerender(<Tree siteId="SiteB" />);
            expect(getByText('registered')).toBeInTheDocument();
        });

        // The load-bearing property of the asymmetric useSyncExternalStore snapshots: SSR emits the
        // neutral loader value (matching a cached app shell), then the client corrects to the cookie
        // value after hydration WITHOUT a hydration-mismatch warning. getServerSnapshot → null is what
        // makes the first client commit match the SSR HTML; a useState/useEffect implementation would
        // render 'registered' on the first commit and mismatch. Mirrors the currency provider's test
        // (lib/currency/use-currency.test.tsx).
        it('hydrates the cached shell and restores userType from the cookie without a hydration warning', () => {
            const Harness = ({ children }: { children: ReactNode }) => (
                <AuthProvider value={{ userType: 'guest' }} siteId={SITE_ID}>
                    {children}
                </AuthProvider>
            );
            const ShowUserType = () => (
                <output data-testid="usertype" aria-label="User type">
                    {useAuth()?.userType ?? 'none'}
                </output>
            );

            // SSR renders with the cookie unreadable server-side → server snapshot → loader guest value.
            const serverHtml = renderToString(
                <Harness>
                    <ShowUserType />
                </Harness>
            );
            expect(serverHtml).toContain('guest');

            // The shopper's own registered hint is present in the browser cookie on the cached shell.
            document.cookie = `${cookieName}=${encode('registered')}`;

            const container = document.createElement('div');
            container.innerHTML = serverHtml;
            document.body.appendChild(container);

            // React 19 surfaces hydration text mismatches via console.error AND onRecoverableError.
            const recoverableErrors: string[] = [];
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            try {
                let root: ReturnType<typeof hydrateRoot>;
                act(() => {
                    root = hydrateRoot(
                        container,
                        <Harness>
                            <ShowUserType />
                        </Harness>,
                        { onRecoverableError: (error) => recoverableErrors.push(String(error)) }
                    );
                });

                // First commit matched the SSR HTML (no mismatch), then the cookie corrected the value.
                expect(container.querySelector('[data-testid="usertype"]')?.textContent).toBe('registered');
                const complaints = [...errorSpy.mock.calls.map((call) => String(call[0])), ...recoverableErrors];
                expect(complaints.filter((message) => /hydrat/i.test(message))).toEqual([]);

                act(() => root.unmount());
            } finally {
                errorSpy.mockRestore();
                document.body.removeChild(container);
            }
        });
    });

    describe('useAuth', () => {
        it('should return undefined when used outside AuthProvider', () => {
            const { result } = renderHook(() => useAuth());
            expect(result.current).toBeUndefined();
        });
    });
});
