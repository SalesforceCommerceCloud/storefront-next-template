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

import { createHash } from 'node:crypto';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
    getTurnstileSiteKey,
    getBrowserTurnstileSiteKey,
    getTurnstileSecretKey,
    isTurnstileEnabled,
    getTurnstileMode,
} from './utils';
import { getTurnstileHmacKey } from './hmac.server';
import type { AppConfig } from '@/types/config';

describe('turnstile-utils', () => {
    describe('getTurnstileSiteKey', () => {
        describe('grouped format with exact hostname matching', () => {
            it('should return site key for exact domain match', () => {
                const config: AppConfig = {
                    security: {
                        turnstile: {
                            sites: {
                                'us-production': [
                                    {
                                        siteKey: '0x4AAA_US_KEY',
                                        domains: ['store1.example.com', 'store2.example.com'],
                                    },
                                ],
                            },
                        },
                    },
                } as unknown as AppConfig;

                expect(getTurnstileSiteKey(config, 'https://store1.example.com')).toBe('0x4AAA_US_KEY');
                expect(getTurnstileSiteKey(config, 'http://store2.example.com')).toBe('0x4AAA_US_KEY');
            });

            it('should handle multiple site keys in one group (>100 domains)', () => {
                const config: AppConfig = {
                    security: {
                        turnstile: {
                            sites: {
                                'us-production': [
                                    {
                                        siteKey: '0x4AAA_US_KEY_1',
                                        domains: ['store1.example.com', 'store2.example.com'],
                                    },
                                    {
                                        siteKey: '0x4AAA_US_KEY_2',
                                        domains: ['store101.example.com', 'store102.example.com'],
                                    },
                                ],
                            },
                        },
                    },
                } as unknown as AppConfig;

                expect(getTurnstileSiteKey(config, 'https://store1.example.com')).toBe('0x4AAA_US_KEY_1');
                expect(getTurnstileSiteKey(config, 'https://store101.example.com')).toBe('0x4AAA_US_KEY_2');
            });

            it('should handle multiple groups', () => {
                const config: AppConfig = {
                    security: {
                        turnstile: {
                            sites: {
                                'us-production': [
                                    {
                                        siteKey: '0x4AAA_US',
                                        domains: ['store.us.example.com'],
                                    },
                                ],
                                'eu-production': [
                                    {
                                        siteKey: '0x4AAA_EU',
                                        domains: ['store.eu.example.com'],
                                    },
                                ],
                                'local-dev': [
                                    {
                                        siteKey: '1x00000000000000000000BB',
                                        domains: ['localhost', '127.0.0.1'],
                                    },
                                ],
                            },
                        },
                    },
                } as unknown as AppConfig;

                expect(getTurnstileSiteKey(config, 'https://store.us.example.com')).toBe('0x4AAA_US');
                expect(getTurnstileSiteKey(config, 'https://store.eu.example.com')).toBe('0x4AAA_EU');
                expect(getTurnstileSiteKey(config, 'http://localhost:5173')).toBe('1x00000000000000000000BB');
            });

            it('should return first matching site key (first match wins)', () => {
                const config: AppConfig = {
                    security: {
                        turnstile: {
                            sites: {
                                group1: [
                                    {
                                        siteKey: 'KEY_1',
                                        domains: ['store.example.com'],
                                    },
                                ],
                                group2: [
                                    {
                                        siteKey: 'KEY_2',
                                        domains: ['store.example.com'],
                                    },
                                ],
                            },
                        },
                    },
                } as unknown as AppConfig;

                // First match wins (group1 is iterated first)
                const result = getTurnstileSiteKey(config, 'https://store.example.com');
                expect(result).toBe('KEY_1');
            });

            it('should return null if no match found', () => {
                const config: AppConfig = {
                    security: {
                        turnstile: {
                            sites: {
                                'us-production': [
                                    {
                                        siteKey: '0x4AAA_US',
                                        domains: ['store.us.example.com'],
                                    },
                                ],
                            },
                        },
                    },
                } as unknown as AppConfig;

                expect(getTurnstileSiteKey(config, 'https://other.com')).toBeNull();
                expect(getTurnstileSiteKey(config, 'https://store.eu.example.com')).toBeNull();
            });

            it('should handle empty sites config', () => {
                const config: AppConfig = {
                    security: {
                        turnstile: {
                            sites: {},
                        },
                    },
                } as unknown as AppConfig;

                expect(getTurnstileSiteKey(config, 'https://example.com')).toBeNull();
            });
        });

        describe('edge cases', () => {
            it('should handle missing security config', () => {
                const config: AppConfig = {} as unknown as AppConfig;
                expect(getTurnstileSiteKey(config, 'https://example.com')).toBeNull();
            });

            it('should handle missing turnstile config', () => {
                const config: AppConfig = {
                    security: {},
                } as unknown as AppConfig;
                expect(getTurnstileSiteKey(config, 'https://example.com')).toBeNull();
            });

            it('should handle URLs with ports', () => {
                const config: AppConfig = {
                    security: {
                        turnstile: {
                            sites: {
                                local: [
                                    {
                                        siteKey: 'LOCAL_KEY',
                                        domains: ['localhost'],
                                    },
                                ],
                            },
                        },
                    },
                } as unknown as AppConfig;

                expect(getTurnstileSiteKey(config, 'http://localhost:5173')).toBe('LOCAL_KEY');
                expect(getTurnstileSiteKey(config, 'http://localhost:8080')).toBe('LOCAL_KEY');
            });

            it('should handle URLs with paths', () => {
                const config: AppConfig = {
                    security: {
                        turnstile: {
                            sites: {
                                prod: [
                                    {
                                        siteKey: 'PROD_KEY',
                                        domains: ['example.com'],
                                    },
                                ],
                            },
                        },
                    },
                } as unknown as AppConfig;

                expect(getTurnstileSiteKey(config, 'https://example.com/checkout')).toBe('PROD_KEY');
                expect(getTurnstileSiteKey(config, 'https://example.com/path/to/page')).toBe('PROD_KEY');
            });

            it('should handle malformed URL via fallback hostname extraction', () => {
                // For inputs that don't parse as a URL (e.g. bare hostname without protocol),
                // the fallback strips any `https?://` prefix, splits on `/` and `:`, and
                // returns the leading segment.
                const config: AppConfig = {
                    security: {
                        turnstile: {
                            sites: {
                                prod: [{ siteKey: 'PROD_KEY', domains: ['example.com'] }],
                            },
                        },
                    },
                } as unknown as AppConfig;

                // No protocol scheme → URL throws → fallback path runs
                expect(getTurnstileSiteKey(config, 'example.com/checkout')).toBe('PROD_KEY');
                expect(getTurnstileSiteKey(config, 'example.com')).toBe('PROD_KEY');
            });

            it('returns null when malformed URL fallback yields a non-matching hostname', () => {
                const config: AppConfig = {
                    security: {
                        turnstile: {
                            sites: {
                                prod: [{ siteKey: 'PROD_KEY', domains: ['example.com'] }],
                            },
                        },
                    },
                } as unknown as AppConfig;

                expect(getTurnstileSiteKey(config, 'not-example.com')).toBeNull();
            });

            it('strips http:// protocol prefix in fallback path', () => {
                const config: AppConfig = {
                    security: {
                        turnstile: {
                            sites: {
                                prod: [{ siteKey: 'PROD_KEY', domains: ['example.com'] }],
                            },
                        },
                    },
                } as unknown as AppConfig;

                // Bare http:// without proper URL structure - fallback strips protocol
                expect(getTurnstileSiteKey(config, 'http://example.com:8080')).toBe('PROD_KEY');
                expect(getTurnstileSiteKey(config, 'https://example.com:443/path')).toBe('PROD_KEY');
            });

            it('returns null when both Origin and Referer would map to non-matching hostnames', () => {
                const config: AppConfig = {
                    security: {
                        turnstile: {
                            sites: {
                                prod: [{ siteKey: 'PROD_KEY', domains: ['allowed.example.com'] }],
                            },
                        },
                    },
                } as unknown as AppConfig;

                expect(getTurnstileSiteKey(config, 'https://attacker.example.com')).toBeNull();
                expect(getTurnstileSiteKey(config, 'attacker.example.com')).toBeNull();
            });

            it('handles empty string input by treating it as a non-match', () => {
                const config: AppConfig = {
                    security: {
                        turnstile: {
                            sites: {
                                prod: [{ siteKey: 'PROD_KEY', domains: ['example.com'] }],
                            },
                        },
                    },
                } as unknown as AppConfig;

                expect(getTurnstileSiteKey(config, '')).toBeNull();
            });
        });
    });

    describe('getTurnstileSecretKey', () => {
        let originalWindow: typeof globalThis.window;

        beforeEach(() => {
            vi.resetModules();
            originalWindow = globalThis.window;
            // @ts-expect-error - temporarily undefining window for server-side tests
            delete globalThis.window;
        });

        afterEach(() => {
            vi.unstubAllEnvs();
            globalThis.window = originalWindow;
        });

        it('should return secret key for a given site key', () => {
            vi.stubEnv(
                'TURNSTILE_SECRET_KEYS',
                JSON.stringify({
                    '0x4AAA_US_KEY': 'secret_us',
                    '0x4AAA_EU_KEY': 'secret_eu',
                })
            );

            expect(getTurnstileSecretKey('0x4AAA_US_KEY')).toBe('secret_us');
            expect(getTurnstileSecretKey('0x4AAA_EU_KEY')).toBe('secret_eu');
        });

        it('should return null if site key not found', () => {
            vi.stubEnv(
                'TURNSTILE_SECRET_KEYS',
                JSON.stringify({
                    '0x4AAA_US_KEY': 'secret_us',
                })
            );

            expect(getTurnstileSecretKey('UNKNOWN_KEY')).toBeNull();
        });

        it('should return null if TURNSTILE_SECRET_KEYS not set', () => {
            vi.unstubAllEnvs();
            expect(getTurnstileSecretKey('0x4AAA_US_KEY')).toBeNull();
        });

        it('should handle malformed JSON gracefully', () => {
            vi.stubEnv('TURNSTILE_SECRET_KEYS', 'not-valid-json');
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            expect(getTurnstileSecretKey('0x4AAA_US_KEY')).toBeNull();
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                '[Turnstile] Failed to parse TURNSTILE_SECRET_KEYS:',
                expect.any(Error)
            );

            consoleErrorSpy.mockRestore();
        });

        it('should return null when called from a browser context (window defined)', () => {
            // Simulate the client-side environment where `typeof window !== 'undefined'`.
            // Production server-only modules must not leak secrets into the bundle even if
            // accidentally imported by client code.
            globalThis.window = {} as Window & typeof globalThis;
            vi.stubEnv('TURNSTILE_SECRET_KEYS', JSON.stringify({ '0x4AAA_US_KEY': 'secret_us' }));

            expect(getTurnstileSecretKey('0x4AAA_US_KEY')).toBeNull();
        });
    });

    describe('getTurnstileHmacKey', () => {
        let originalWindow: typeof globalThis.window;

        beforeEach(() => {
            vi.resetModules();
            originalWindow = globalThis.window;
            // @ts-expect-error - temporarily undefining window for server-side tests
            delete globalThis.window;
        });

        afterEach(() => {
            vi.unstubAllEnvs();
            globalThis.window = originalWindow;
        });

        it('returns a 32-byte Buffer derived from the Cloudflare secret', () => {
            vi.stubEnv('TURNSTILE_SECRET_KEYS', JSON.stringify({ 'site-key': 'my-cloudflare-secret' }));

            const result = getTurnstileHmacKey('site-key');

            expect(result).toBeInstanceOf(Buffer);
            expect(result?.length).toBe(32);

            // Verify domain separation: the key is SHA-256("sfnext-turnstile-cookie-binding:" + secret),
            // not the raw secret.
            const expected = createHash('sha256')
                .update('sfnext-turnstile-cookie-binding:my-cloudflare-secret')
                .digest();
            expect(result?.equals(expected)).toBe(true);
        });

        it('does NOT return the raw Cloudflare secret as the key', () => {
            const rawSecret = 'my-cloudflare-secret';
            vi.stubEnv('TURNSTILE_SECRET_KEYS', JSON.stringify({ 'site-key': rawSecret }));

            const result = getTurnstileHmacKey('site-key');
            const rawKey = Buffer.from(rawSecret, 'utf8');

            // The derived key must differ from the raw secret bytes.
            expect(result?.equals(rawKey)).toBe(false);
        });

        it('returns null when secret key is not configured', () => {
            vi.stubEnv('TURNSTILE_SECRET_KEYS', JSON.stringify({}));

            expect(getTurnstileHmacKey('unknown-site')).toBeNull();
        });

        it('returns null in a browser context via getTurnstileSecretKey guard', () => {
            // hmac.server.ts is server-only (no local `typeof window` guard). Browser
            // refusal is intentional via getTurnstileSecretKey(), which returns null
            // when `window` is defined so secrets never resolve client-side.
            globalThis.window = {} as Window & typeof globalThis;
            vi.stubEnv('TURNSTILE_SECRET_KEYS', JSON.stringify({ 'site-key': 'secret' }));

            expect(getTurnstileHmacKey('site-key')).toBeNull();
        });

        it('returns null when TURNSTILE_SECRET_KEYS is not set', () => {
            vi.unstubAllEnvs();
            expect(getTurnstileHmacKey('site-key')).toBeNull();
        });
    });

    describe('getBrowserTurnstileSiteKey', () => {
        const configWithLocalhost: AppConfig = {
            security: {
                turnstile: {
                    enabled: true,
                    sites: {
                        local: [{ siteKey: 'test-site-key', domains: ['localhost'] }],
                    },
                },
            },
        } as unknown as AppConfig;

        it('returns the site key for the current window location', () => {
            expect(getBrowserTurnstileSiteKey(configWithLocalhost)).toBe('test-site-key');
        });

        it('returns null during SSR when window is undefined', () => {
            const originalWindow = globalThis.window;
            // @ts-expect-error - simulate SSR
            delete globalThis.window;
            try {
                expect(getBrowserTurnstileSiteKey(configWithLocalhost)).toBeNull();
            } finally {
                globalThis.window = originalWindow;
            }
        });
    });

    describe('isTurnstileEnabled', () => {
        it('should return false by default', () => {
            const config: AppConfig = {} as unknown as AppConfig;
            expect(isTurnstileEnabled(config)).toBe(false);
        });

        it('should return configured value', () => {
            const configEnabled: AppConfig = {
                security: { turnstile: { enabled: true } },
            } as unknown as AppConfig;
            expect(isTurnstileEnabled(configEnabled)).toBe(true);

            const configDisabled: AppConfig = {
                security: { turnstile: { enabled: false } },
            } as unknown as AppConfig;
            expect(isTurnstileEnabled(configDisabled)).toBe(false);
        });
    });

    describe('getTurnstileMode', () => {
        it('should return "managed" by default', () => {
            const config: AppConfig = {} as unknown as AppConfig;
            expect(getTurnstileMode(config)).toBe('managed');
        });

        it('should return configured mode', () => {
            const configInvisible: AppConfig = {
                security: { turnstile: { mode: 'invisible' } },
            } as unknown as AppConfig;
            expect(getTurnstileMode(configInvisible)).toBe('invisible');

            const configManaged: AppConfig = {
                security: { turnstile: { mode: 'managed' } },
            } as unknown as AppConfig;
            expect(getTurnstileMode(configManaged)).toBe('managed');

            const configNonInteractive: AppConfig = {
                security: { turnstile: { mode: 'non-interactive' } },
            } as unknown as AppConfig;
            expect(getTurnstileMode(configNonInteractive)).toBe('non-interactive');
        });
    });
});
