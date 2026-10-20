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

import { defaultCspDirectives, type SecurityConfig } from '@salesforce/storefront-next-runtime/security';
import { describe, expect, it, vi } from 'vitest';
import { mergeExtensionServerCsp } from './extension-server-csp';

type Directive = 'script-src' | 'connect-src' | 'worker-src';

function defaultSources(name: Directive): string[] {
    const sources = defaultCspDirectives[name];
    if (!sources) throw new Error(`missing default ${name}`);
    return sources;
}

function directive(headers: SecurityConfig, name: Directive): string[] | undefined {
    const csp = headers.csp;
    if (!csp) return undefined;
    const sources = csp.directives?.[name];
    return Array.isArray(sources) ? sources : undefined;
}

describe('mergeExtensionServerCsp', () => {
    it('returns the same headers when no extension declares csp', () => {
        const headers = { enabled: true };
        expect(mergeExtensionServerCsp(headers, undefined)).toBe(headers);
        expect(mergeExtensionServerCsp(headers, { analytics: { apiKey: '' } })).toBe(headers);
    });

    it('appends wildcard and websocket hosts onto the SDK defaults', () => {
        const merged = mergeExtensionServerCsp(
            {},
            {
                analytics: {
                    csp: {
                        'script-src': ['https://*.example.com', 'https://*.example.co.uk'],
                        'connect-src': ['https://*.example.com', 'wss://*.example.com'],
                    },
                },
            }
        );

        expect(merged.csp).toMatchObject({
            directives: {
                'script-src': [...defaultSources('script-src'), 'https://*.example.com', 'https://*.example.co.uk'],
                'connect-src': [...defaultSources('connect-src'), 'https://*.example.com', 'wss://*.example.com'],
            },
        });
    });

    it('keeps a merchant directive list and appends extension hosts', () => {
        const merged = mergeExtensionServerCsp(
            { csp: { directives: { 'script-src': ["'self'", 'https://cdn.merchant.com'] } } },
            { checkout: { csp: { 'script-src': ['https://js.example.com', 'https://*.cdn.example.com'] } } }
        );

        expect(directive(merged, 'script-src')).toEqual([
            "'self'",
            'https://cdn.merchant.com',
            'https://js.example.com',
            'https://*.cdn.example.com',
        ]);
    });

    it('unions hosts from more than one extension and drops duplicates', () => {
        const merged = mergeExtensionServerCsp(
            {},
            {
                analytics: { csp: { 'script-src': ['https://cdn.widgets.example.com'] } },
                other: { csp: { 'script-src': ['https://cdn.widgets.example.com', 'https://cdn.example.com'] } },
            }
        );
        const scriptSrc = directive(merged, 'script-src');
        expect(scriptSrc?.filter((source) => source === 'https://cdn.widgets.example.com')).toHaveLength(1);
        expect(scriptSrc).toContain('https://cdn.example.com');
    });

    it('ignores keywords, paths, and values that could inject another directive', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const merged = mergeExtensionServerCsp(
            {},
            {
                bad: {
                    csp: {
                        'script-src': [
                            "'unsafe-inline'",
                            "'unsafe-eval'",
                            '*',
                            'https://cdn.example.com/collect.js',
                            'https://ok.example.com; script-src https://evil.example.com',
                            'https://ok.example.com',
                            'https://*',
                            'https://*.com',
                            'https://*.co.uk',
                            'https://*.github.io',
                            'https://*.vercel.app',
                            'https://cdn*.example.com',
                            'wss://*',
                            'ws://localhost:*',
                        ],
                        'not-a-directive': ['https://ignored.example.com'],
                        'form-action': ['https://evil.example.com'],
                        'default-src': ['https://evil.example.com'],
                    },
                },
            }
        );
        expect(directive(merged, 'script-src')).toEqual([...defaultSources('script-src'), 'https://ok.example.com']);
        expect(merged.csp && typeof merged.csp === 'object' ? merged.csp.directives : undefined).not.toHaveProperty(
            'form-action'
        );
        expect(merged.csp && typeof merged.csp === 'object' ? merged.csp.directives : undefined).not.toHaveProperty(
            'default-src'
        );
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('warns once for an unknown directive, a non-list, and an invalid host', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        mergeExtensionServerCsp(
            {},
            {
                bad: {
                    csp: {
                        'font-src': ['https://cdn.example.com'],
                        'script-src': 'https://cdn.example.com',
                        'connect-src': ['https://ok.example.com', 'https://*.co.uk'],
                    },
                },
            }
        );

        const messages = warn.mock.calls.map((call) => String(call[1]));
        expect(messages).toEqual([
            expect.stringContaining('"directive":"font-src"'),
            expect.stringContaining('"reason":"not a list"'),
            expect.stringContaining('"source":"https://*.co.uk"'),
        ]);
        warn.mockRestore();
    });

    it('starts worker-src from script-src so existing workers keep loading', () => {
        const merged = mergeExtensionServerCsp({}, { analytics: { csp: { 'worker-src': ['https://*.example.com'] } } });
        expect(directive(merged, 'worker-src')).toEqual([...defaultSources('script-src'), 'https://*.example.com']);
    });

    it('starts worker-src from a merchant script-src', () => {
        const merged = mergeExtensionServerCsp(
            { csp: { directives: { 'script-src': ["'self'", 'https://cdn.merchant.com'] } } },
            { analytics: { csp: { 'worker-src': ['https://*.example.com'] } } }
        );
        expect(directive(merged, 'worker-src')).toEqual([
            "'self'",
            'https://cdn.merchant.com',
            'https://*.example.com',
        ]);
    });

    it('keeps extension script-src hosts on the worker-src copy', () => {
        const merged = mergeExtensionServerCsp(
            {},
            {
                analytics: {
                    csp: {
                        'worker-src': ['https://workers.example.com'],
                        'script-src': ['https://cdn.example.com'],
                    },
                },
                checkout: { csp: { 'script-src': ['https://cdn.checkout.example.com'] } },
            }
        );
        expect(directive(merged, 'worker-src')).toEqual([
            ...defaultSources('script-src'),
            'https://cdn.example.com',
            'https://cdn.checkout.example.com',
            'https://workers.example.com',
        ]);
    });

    it('keeps a merchant worker-src list and appends extension hosts', () => {
        const merged = mergeExtensionServerCsp(
            { csp: { directives: { 'worker-src': ["'self'", 'blob:'] } } },
            { analytics: { csp: { 'worker-src': ['https://*.example.com'] } } }
        );
        expect(directive(merged, 'worker-src')).toEqual(["'self'", 'blob:', 'https://*.example.com']);
    });

    it('keeps the default list when a merchant directive is not a list', () => {
        const merged = mergeExtensionServerCsp(
            { csp: { directives: { 'script-src': undefined } } },
            { analytics: { csp: { 'script-src': ['https://cdn.example.com'] } } }
        );
        expect(directive(merged, 'script-src')).toEqual([...defaultSources('script-src'), 'https://cdn.example.com']);
    });

    it('does not merge when CSP is disabled', () => {
        const headers = { csp: false as const };
        expect(
            mergeExtensionServerCsp(headers, { analytics: { csp: { 'script-src': ['https://cdn.example.com'] } } })
        ).toBe(headers);
    });
});
