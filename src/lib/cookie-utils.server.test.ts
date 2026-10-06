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
import {
    getCookieNameWithSiteId,
    getCookieConfig,
    resolveCookieDomain,
    COOKIE_NAMESPACE_EXCLUSIONS,
    parseAllCookies,
    createCookie,
} from './cookie-utils.server';
import { mockBuildConfig, mockAltSiteObject } from '@/test-utils/config';

const mockLogger = vi.hoisted(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
}));

// resolveCookieDomain logs (once per bad value) when it rejects an invalid cookie domain.
vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => mockLogger),
}));

vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    getConfig: vi.fn(),
}));

// isRemote() decides the default `secure` flag. Default it to `true` (deployed) so the
// bulk of the assertions below exercise the production cookie shape; the dedicated
// "local development" block flips it to `false` to cover the Safari-on-localhost fix.
vi.mock('@salesforce/storefront-next-runtime/env', () => ({
    isRemote: vi.fn(() => true),
}));

import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { isRemote } from '@salesforce/storefront-next-runtime/env';
import type { AppConfig } from '@/types/config';

describe('cookie-utils', () => {
    const mockAppConfig = {
        ...mockBuildConfig.app,
        commerce: {
            api: {
                siteId: mockAltSiteObject.id,
                clientId: 'test-client',
                organizationId: 'test-org',
                shortCode: 'test123',
                proxy: '/mobify/proxy/api',
                callback: '/callback',
                privateKeyEnabled: false,
                registeredRefreshTokenExpirySeconds: undefined,
                guestRefreshTokenExpirySeconds: undefined,
            },
            sites: [
                {
                    defaultSiteId: mockAltSiteObject.id,
                    defaultLocale: mockAltSiteObject.defaultLocale,
                    defaultCurrency: mockAltSiteObject.defaultCurrency,
                    supportedLocales: [],
                    supportedCurrencies: [],
                    cookies: {},
                },
            ],
        },
    };

    describe('COOKIE_NAMESPACE_EXCLUSIONS', () => {
        it('should contain expected excluded cookies', () => {
            expect(COOKIE_NAMESPACE_EXCLUSIONS).toContain('dwsid');
            expect(COOKIE_NAMESPACE_EXCLUSIONS).toBeInstanceOf(Array);
        });
    });

    describe('getCookieNameWithSiteId', () => {
        const createMockContextWithSite = (siteId: string) =>
            ({
                get: vi.fn(() => ({ site: { id: siteId } })),
            }) as any;

        const mockContext = createMockContextWithSite(mockAltSiteObject.id);

        afterEach(() => {
            vi.clearAllMocks();
        });

        it('should return excluded cookie names as-is', () => {
            expect(getCookieNameWithSiteId('dwsid', mockContext)).toBe('dwsid');
        });

        it('should namespace non-excluded cookies with siteId from site context', () => {
            expect(getCookieNameWithSiteId('refresh-token', mockContext)).toBe(`refresh-token_${mockAltSiteObject.id}`);
            expect(getCookieNameWithSiteId('access-token', mockContext)).toBe(`access-token_${mockAltSiteObject.id}`);
        });

        it('should use siteId from site context', () => {
            const context = createMockContextWithSite('ClientSite');
            expect(getCookieNameWithSiteId('refresh-token', context)).toBe('refresh-token_ClientSite');
        });

        it('should handle cookies with special characters', () => {
            expect(getCookieNameWithSiteId('my-cookie_name.v2', mockContext)).toBe(
                `my-cookie_name.v2_${mockAltSiteObject.id}`
            );
        });

        it('should handle empty string cookie name', () => {
            expect(getCookieNameWithSiteId('', mockContext)).toBe(`_${mockAltSiteObject.id}`);
        });

        it('should work with different siteIds', () => {
            const context1 = createMockContextWithSite('Site1');
            expect(getCookieNameWithSiteId('auth', context1)).toBe('auth_Site1');

            const context2 = createMockContextWithSite('Site2');
            expect(getCookieNameWithSiteId('auth', context2)).toBe('auth_Site2');
        });
    });

    describe('getCookieConfig', () => {
        const defaultMockContext = {
            get: vi.fn(() => undefined),
        } as any;

        beforeEach(() => {
            vi.mocked(getConfig).mockReturnValue(mockAppConfig);
            // clearAllMocks (below) does not restore implementations, so re-assert the
            // deployed default before every test; the local-dev block overrides it.
            vi.mocked(isRemote).mockReturnValue(true);
        });

        afterEach(() => {
            vi.clearAllMocks();
        });

        it('should return defaults when no options provided', () => {
            const config = getCookieConfig(undefined, defaultMockContext);

            expect(config).toEqual({
                path: '/',
                sameSite: 'lax',
                secure: true,
            });
        });

        it('should merge provided options with defaults', () => {
            const config = getCookieConfig(
                {
                    httpOnly: true,
                    maxAge: 3600,
                },
                defaultMockContext
            );

            expect(config).toEqual({
                path: '/',
                sameSite: 'lax',
                secure: true,
                httpOnly: true,
                maxAge: 3600,
            });
        });

        it('should allow overriding default values', () => {
            const config = getCookieConfig(
                {
                    path: '/custom',
                    sameSite: 'strict',
                    secure: false,
                },
                defaultMockContext
            );

            expect(config).toEqual({
                path: '/custom',
                sameSite: 'strict',
                secure: false,
            });
        });

        it('should apply domain from site context (highest priority)', () => {
            const contextWithSite = {
                get: vi.fn(() => ({ site: { cookies: { domain: '.example.com' } } })),
            } as any;

            const config = getCookieConfig({}, contextWithSite);

            expect(config).toEqual({
                path: '/',
                sameSite: 'lax',
                secure: true,
                domain: '.example.com',
            });
        });

        it('should override provided domain with site context domain', () => {
            const contextWithSite = {
                get: vi.fn(() => ({ site: { cookies: { domain: '.env-domain.com' } } })),
            } as any;

            const config = getCookieConfig(
                {
                    domain: '.code-domain.com',
                    path: '/custom',
                },
                contextWithSite
            );

            expect(config).toEqual({
                path: '/custom',
                sameSite: 'lax',
                secure: true,
                domain: '.env-domain.com', // site context wins
            });
        });

        it('should handle appConfig without cookie domain', () => {
            vi.mocked(getConfig).mockReturnValue({
                commerce: {
                    sites: [
                        {
                            cookies: {},
                        },
                    ],
                },
            } as AppConfig);

            const config = getCookieConfig({ domain: '.test.com' }, defaultMockContext);

            expect(config).toEqual({
                path: '/',
                sameSite: 'lax',
                secure: true,
                domain: '.test.com',
            });
        });

        it('should handle appConfig with empty string domain', () => {
            vi.mocked(getConfig).mockReturnValue({
                commerce: {
                    sites: [
                        {
                            cookies: {
                                domain: '',
                            },
                        },
                    ],
                },
            } as AppConfig);

            const config = getCookieConfig({ domain: '.test.com' }, defaultMockContext);

            // Empty string is falsy, so it doesn't override
            expect(config).toEqual({
                path: '/',
                sameSite: 'lax',
                secure: true,
                domain: '.test.com',
            });
        });

        it('should handle appConfig without site or cookies properties', () => {
            vi.mocked(getConfig).mockReturnValue({
                commerce: {
                    sites: [],
                },
            } as any);

            const config = getCookieConfig({ httpOnly: true }, defaultMockContext);

            expect(config).toEqual({
                path: '/',
                sameSite: 'lax',
                secure: true,
                httpOnly: true,
            });
        });

        describe('global cookie domain (app.cookies.domain)', () => {
            it('falls back to app.cookies.domain when the site has no per-site domain', () => {
                const contextNoSiteDomain = {
                    get: vi.fn(() => ({ site: { id: 'RefArch' } })),
                } as any;
                vi.mocked(getConfig).mockReturnValue({ cookies: { domain: '.global.com' } } as AppConfig);

                const config = getCookieConfig({}, contextNoSiteDomain);

                expect(config).toEqual({
                    path: '/',
                    sameSite: 'lax',
                    secure: true,
                    domain: '.global.com',
                });
            });

            it('prefers the per-site domain over the global app.cookies.domain', () => {
                const contextWithSiteDomain = {
                    get: vi.fn(() => ({ site: { cookies: { domain: '.site.com' } } })),
                } as any;
                vi.mocked(getConfig).mockReturnValue({ cookies: { domain: '.global.com' } } as AppConfig);

                const config = getCookieConfig({}, contextWithSiteDomain);

                expect(config.domain).toBe('.site.com');
            });

            it('emits no domain (host-only) when neither per-site nor global domain is set', () => {
                const contextNoSite = { get: vi.fn(() => undefined) } as any;
                vi.mocked(getConfig).mockReturnValue({ cookies: { domain: '' } } as AppConfig);

                const config = getCookieConfig({}, contextNoSite);

                expect(config).toEqual({
                    path: '/',
                    sameSite: 'lax',
                    secure: true,
                });
                expect(config.domain).toBeUndefined();
            });

            it('falls back to the global domain when the per-site domain is an empty string', () => {
                // Guards the `||` (not `??`) semantics: an empty per-site string is treated as
                // "unset" and inherits the global default, rather than forcing host-only.
                const contextEmptyPerSite = {
                    get: vi.fn(() => ({ site: { cookies: { domain: '' } } })),
                } as any;
                vi.mocked(getConfig).mockReturnValue({ cookies: { domain: '.global.com' } } as AppConfig);

                const config = getCookieConfig({}, contextEmptyPerSite);

                expect(config.domain).toBe('.global.com');
            });
        });

        describe('invalid cookie domain validation', () => {
            // A misconfigured `cookies.domain` must never reach Set-Cookie: a wildcard/malformed
            // value is silently dropped by the browser (so every cookie becomes host-only anyway,
            // but inconsistently), and a value with a separator/`=` could inject a second cookie
            // attribute. resolveCookieDomain is the single choke point every cookie's Domain
            // resolves through, so validating here fixes it for all cookies uniformly.
            // Mirrors PWA Kit's INVALID_COOKIE_DOMAIN_PATTERN. Each test uses a distinct bad value
            // so the process-lifetime "warn once" Set does not dedup across tests.
            const noSiteContext = () => ({ get: vi.fn(() => undefined) }) as any;

            it('drops a wildcard domain to host-only scoping and warns', () => {
                vi.mocked(getConfig).mockReturnValue({ cookies: { domain: '*.evil.com' } } as AppConfig);

                const config = getCookieConfig({}, noSiteContext());

                // No Domain attribute at all — the whole config is the host-only default shape.
                expect(config).toEqual({ path: '/', sameSite: 'lax', secure: true });
                expect(config.domain).toBeUndefined();
                expect(mockLogger.warn).toHaveBeenCalledTimes(1);
            });

            it('drops a domain carrying an injected attribute (separator/space) to host-only and warns', () => {
                vi.mocked(getConfig).mockReturnValue({
                    cookies: { domain: '.example.com; Path=/; Domain=evil.com' },
                } as AppConfig);

                const config = getCookieConfig({}, noSiteContext());

                expect(config.domain).toBeUndefined();
                expect(mockLogger.warn).toHaveBeenCalledTimes(1);
            });

            it('keeps a valid leading-dot domain and does not warn', () => {
                vi.mocked(getConfig).mockReturnValue({ cookies: { domain: '.valid-keep.com' } } as AppConfig);

                const config = getCookieConfig({}, noSiteContext());

                expect(config.domain).toBe('.valid-keep.com');
                expect(mockLogger.warn).not.toHaveBeenCalled();
            });

            it('warns at most once per distinct invalid domain across repeated resolutions', () => {
                vi.mocked(getConfig).mockReturnValue({ cookies: { domain: 'bad,domain.com' } } as AppConfig);
                const context = noSiteContext();

                expect(resolveCookieDomain(context)).toBeUndefined();
                expect(resolveCookieDomain(context)).toBeUndefined();
                expect(resolveCookieDomain(context)).toBeUndefined();

                expect(mockLogger.warn).toHaveBeenCalledTimes(1);
            });
        });

        it('should preserve Date objects for expires', () => {
            const expiryDate = new Date('2025-12-31');
            const config = getCookieConfig(
                {
                    expires: expiryDate,
                },
                defaultMockContext
            );

            expect(config.expires).toBe(expiryDate);
            expect(config.expires).toBeInstanceOf(Date);
        });

        it('should handle all cookie attributes', () => {
            const contextWithSite = {
                get: vi.fn(() => ({ site: { cookies: { domain: '.example.com' } } })),
            } as any;

            const expiryDate = new Date('2025-12-31');
            const config = getCookieConfig(
                {
                    path: '/api',
                    secure: false,
                    sameSite: 'none',
                    expires: expiryDate,
                    maxAge: 7200,
                    httpOnly: true,
                },
                contextWithSite
            );

            expect(config).toEqual({
                path: '/api',
                // SameSite=None forces Secure (browsers reject None without Secure),
                // overriding the provided secure:false.
                secure: true,
                sameSite: 'none',
                expires: expiryDate,
                maxAge: 7200,
                httpOnly: true,
                domain: '.example.com', // from site context
            });
        });

        it('should work with undefined options', () => {
            const config = getCookieConfig(undefined, defaultMockContext);

            expect(config).toEqual({
                path: '/',
                sameSite: 'lax',
                secure: true,
            });
        });

        it('should preserve custom properties from provided options', () => {
            const config = getCookieConfig(
                {
                    path: '/',
                    customProp: 'customValue',
                } as any,
                defaultMockContext
            );

            expect(config).toMatchObject({
                path: '/',
                sameSite: 'lax',
                secure: true,
                customProp: 'customValue',
            });
        });

        it.each([
            ['strict', 'strict' as const],
            ['lax', 'lax' as const],
            ['none', 'none' as const],
        ])('should handle sameSite: %s', (_, sameSiteValue) => {
            const config = getCookieConfig(
                {
                    sameSite: sameSiteValue,
                },
                defaultMockContext
            );

            expect(config.sameSite).toBe(sameSiteValue);
        });

        it('should verify precedence order: site context > options > defaults', () => {
            const contextWithSite = {
                get: vi.fn(() => ({ site: { cookies: { domain: '.sitecontext.com' } } })),
            } as any;

            // Test all three levels of precedence
            const config = getCookieConfig(
                {
                    domain: '.options.com', // Will be overridden by site context
                    path: '/options', // Will override default
                    // secure not provided, will use default
                },
                contextWithSite
            );

            expect(config).toEqual({
                domain: '.sitecontext.com', // HIGHEST: from site context
                path: '/options', // MIDDLE: from options
                secure: true, // LOWEST: from defaults
                sameSite: 'lax', // LOWEST: from defaults
            });
        });

        describe('design mode detection', () => {
            const createMockContext = (isDesignMode: boolean) => ({
                get: vi.fn(() => ({
                    isDesignMode,
                    isPreviewMode: false,
                })),
            });

            it('should apply partitioned cookie attributes in design mode', () => {
                const mockContext = createMockContext(true) as any;

                const config = getCookieConfig({}, mockContext);

                expect(config).toEqual({
                    path: '/',
                    sameSite: 'none',
                    secure: true,
                    partitioned: true,
                });
            });

            it('should use normal defaults when not in design mode', () => {
                const mockContext = createMockContext(false) as any;

                const config = getCookieConfig({}, mockContext);

                expect(config).toEqual({
                    path: '/',
                    sameSite: 'lax',
                    secure: true,
                });
            });

            it('should use normal defaults when context has no mode detection', () => {
                const config = getCookieConfig({}, defaultMockContext);

                expect(config).toEqual({
                    path: '/',
                    sameSite: 'lax',
                    secure: true,
                });
            });

            it('should allow overriding design mode attributes with provided options', () => {
                const mockContext = createMockContext(true) as any;

                const config = getCookieConfig(
                    {
                        sameSite: 'strict',
                        partitioned: false,
                    },
                    mockContext
                );

                expect(config).toEqual({
                    path: '/',
                    sameSite: 'strict',
                    secure: true,
                    partitioned: false,
                });
            });

            it('should handle context.get returning undefined for modeDetection', () => {
                const mockContext = {
                    get: vi.fn(() => undefined),
                } as any;

                const config = getCookieConfig({}, mockContext);

                expect(config).toEqual({
                    path: '/',
                    sameSite: 'lax',
                    secure: true,
                });
            });

            it('should handle mode detection without isDesignMode property', () => {
                const mockContext = {
                    get: vi.fn(() => ({
                        // Missing isDesignMode property (undefined value)
                        isDesignMode: undefined,
                        isPreviewMode: false,
                    })),
                } as any;

                const config = getCookieConfig({}, mockContext);

                expect(config).toEqual({
                    path: '/',
                    sameSite: 'lax',
                    secure: true,
                });
            });
        });

        describe('local development (not deployed)', () => {
            beforeEach(() => {
                // Local `pnpm dev` / `pnpm preview`: BUNDLE_ID unset or 'local'.
                vi.mocked(isRemote).mockReturnValue(false);
            });

            it('omits Secure so Safari persists cookies over http://localhost', () => {
                const config = getCookieConfig({}, defaultMockContext);

                expect(config).toEqual({
                    path: '/',
                    sameSite: 'lax',
                    secure: false,
                });
            });

            it('still applies provided options, with Secure off by default', () => {
                const config = getCookieConfig({ httpOnly: true, maxAge: 3600 }, defaultMockContext);

                expect(config).toEqual({
                    path: '/',
                    sameSite: 'lax',
                    secure: false,
                    httpOnly: true,
                    maxAge: 3600,
                });
            });

            it('still forces Secure in design mode (SameSite=None requires Secure)', () => {
                const designModeContext = {
                    get: vi.fn(() => ({ isDesignMode: true, isPreviewMode: false })),
                } as any;

                const config = getCookieConfig({}, designModeContext);

                expect(config).toEqual({
                    path: '/',
                    sameSite: 'none',
                    secure: true,
                    partitioned: true,
                });
            });
        });
    });

    describe('parseAllCookies', () => {
        it('should return empty object for null cookie header', () => {
            const result = parseAllCookies(null);
            expect(result).toEqual({});
        });

        it('should return empty object for empty cookie header', () => {
            const result = parseAllCookies('');
            expect(result).toEqual({});
        });

        it('should parse a single cookie', () => {
            const result = parseAllCookies('token=abc123');
            expect(result).toEqual({ token: 'abc123' });
        });

        it('should parse multiple cookies', () => {
            const result = parseAllCookies('token=abc123; user=john; count=42');
            expect(result).toEqual({
                token: 'abc123',
                user: 'john',
                count: '42',
            });
        });

        it('should handle cookie values with equals sign', () => {
            const result = parseAllCookies('token=base64==; other=value');
            expect(result).toEqual({
                token: 'base64==',
                other: 'value',
            });
        });

        it('should trim cookie parts but preserve spaces in keys and values', () => {
            const result = parseAllCookies('token=abc123; user=john');
            expect(result).toEqual({
                token: 'abc123',
                user: 'john',
            });
        });

        it('should ignore empty cookie parts', () => {
            const result = parseAllCookies('token=abc123;; ;user=john');
            expect(result).toEqual({
                token: 'abc123',
                user: 'john',
            });
        });

        it('should exclude cookies with empty values', () => {
            const result = parseAllCookies('token=; user=john; empty=');
            expect(result).toEqual({
                user: 'john',
            });
        });
    });

    describe('createCookie', () => {
        const mockContext = {
            get: vi.fn(() => ({ site: { id: mockAltSiteObject.id } })),
        } as any;

        beforeEach(() => {
            vi.mocked(getConfig).mockReturnValue(mockAppConfig);
            vi.mocked(isRemote).mockReturnValue(true);
        });

        afterEach(() => {
            vi.clearAllMocks();
        });

        it('should parse a cookie value from a Cookie header', async () => {
            const cookie = createCookie<string>('token', { path: '/' }, mockContext);
            const value = await cookie.parse(`token_${mockAltSiteObject.id}=abc123; other=value`);
            expect(value).toBe('abc123');
        });

        it('should return null when cookie is not found', async () => {
            const cookie = createCookie<string>('token', { path: '/' }, mockContext);
            const value = await cookie.parse('other=value');
            expect(value).toBeNull();
        });

        it('should return null for null cookie header', async () => {
            const cookie = createCookie<string>('token', { path: '/' }, mockContext);
            const value = await cookie.parse(null);
            expect(value).toBeNull();
        });

        it('should serialize a cookie value to Set-Cookie header', async () => {
            const cookie = createCookie<string>('token', { path: '/', secure: true, sameSite: 'lax' }, mockContext);
            const header = await cookie.serialize('abc123');
            expect(header).toContain(`token_${mockAltSiteObject.id}=abc123`);
            expect(header).toContain('Path=/');
            expect(header).toContain('Secure');
            expect(header).toContain('SameSite=Lax');
        });

        it('should serialize empty value for cookie deletion', async () => {
            const cookie = createCookie<string>('token', { path: '/' }, mockContext);
            const header = await cookie.serialize('');
            expect(header).toContain(`token_${mockAltSiteObject.id}=`);
        });

        it('should emit Max-Age=0 when serializing a deletion with maxAge:0', async () => {
            // Cookie deletions rely on this: maxAge:0 must produce `Max-Age=0` (a deletion).
            // serialize emits Max-Age for any `maxAge !== undefined`, so 0 is NOT treated as
            // falsy/unset here — unlike PWA Kit's cookieAsString, which drops maxAge:0 and must use
            // `expires` instead. This test pins that SFN-specific difference.
            const cookie = createCookie<string>('token', { path: '/' }, mockContext);
            const header = await cookie.serialize('', { maxAge: 0 });
            expect(header).toContain(`token_${mockAltSiteObject.id}=`);
            expect(header).toContain('Max-Age=0');
        });

        it('should store values as-is without encoding', async () => {
            const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';
            const cookie = createCookie<string>('cc-at', { path: '/' }, mockContext);
            const header = await cookie.serialize(jwt);
            expect(header).toContain(`cc-at_${mockAltSiteObject.id}=${jwt}`);
        });

        it('should handle cookie values with equals signs', async () => {
            const cookie = createCookie<string>('token', { path: '/' }, mockContext);
            const value = await cookie.parse(`token_${mockAltSiteObject.id}=base64value==; other=x`);
            expect(value).toBe('base64value==');
        });
    });
});
