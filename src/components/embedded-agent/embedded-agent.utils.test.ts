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
import { describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/utils', async () => {
    const actual = await vi.importActual<typeof import('@/lib/utils')>('@/lib/utils');
    return {
        ...actual,
        resolveAssetUrl: (url: string) => `RESOLVED:${url}`,
    };
});

import {
    DEFAULT_CAPABILITIES_VERSION,
    DEFAULT_PRODUCT_ID_PATTERN,
    DEFAULT_WIDGET_SCRIPT_SRC,
    MAX_PDP_QUESTIONS,
    isEmbeddedAgentConfigured,
    isEmbeddedAgentEnabled,
    isTrustedWidgetScriptUrl,
    parsePdpQuestions,
    resolveWidgetScriptSrc,
    type EmbeddedAgentConfig,
} from './embedded-agent.utils';

const validConfig: EmbeddedAgentConfig = {
    enabled: true,
    scrt2Url: 'https://scrt2.example.com',
    orgId: '00D000000000000',
    esDeveloperName: 'My_Agent',
};

describe('isEmbeddedAgentEnabled', () => {
    test('accepts the boolean true', () => {
        expect(isEmbeddedAgentEnabled(true)).toBe(true);
    });

    test('accepts the string "true" (env-var form)', () => {
        expect(isEmbeddedAgentEnabled('true')).toBe(true);
    });

    test.each([false, 'false', '', 'TRUE', 'yes', '1', undefined])('rejects %p', (value) => {
        expect(isEmbeddedAgentEnabled(value as boolean | string | undefined)).toBe(false);
    });
});

describe('isEmbeddedAgentConfigured', () => {
    test('returns true for a fully populated enabled config', () => {
        expect(isEmbeddedAgentConfigured(validConfig)).toBe(true);
    });

    test('returns false for null / undefined', () => {
        expect(isEmbeddedAgentConfigured(null)).toBe(false);
        expect(isEmbeddedAgentConfigured(undefined)).toBe(false);
    });

    test('returns false when enabled is falsy', () => {
        expect(isEmbeddedAgentConfigured({ ...validConfig, enabled: false })).toBe(false);
    });

    test.each(['scrt2Url', 'orgId', 'esDeveloperName'] as const)('returns false when %s is missing', (field) => {
        const broken = { ...validConfig, [field]: '' };
        expect(isEmbeddedAgentConfigured(broken)).toBe(false);
    });

    test('returns false when a required string is whitespace-only', () => {
        expect(isEmbeddedAgentConfigured({ ...validConfig, scrt2Url: '   ' })).toBe(false);
    });

    test('returns false when a required string is wrong type', () => {
        expect(isEmbeddedAgentConfigured({ ...validConfig, orgId: 42 as unknown as string })).toBe(false);
    });
});

describe('isTrustedWidgetScriptUrl', () => {
    test('accepts the exact cimulate.ai domain over HTTPS', () => {
        expect(isTrustedWidgetScriptUrl('https://cimulate.ai/inline-agent-widget.umd.js')).toBe(true);
    });

    test('accepts a cimulate.ai subdomain', () => {
        expect(isTrustedWidgetScriptUrl('https://cdn.search.cimulate.ai/x/y.umd.js')).toBe(true);
    });

    test('accepts a sfcc-store-internal.net subdomain', () => {
        expect(isTrustedWidgetScriptUrl('https://a.sfcc-store-internal.net/x.umd.js')).toBe(true);
    });

    test('rejects HTTP', () => {
        expect(isTrustedWidgetScriptUrl('http://cimulate.ai/x.umd.js')).toBe(false);
    });

    test('rejects a lookalike domain', () => {
        expect(isTrustedWidgetScriptUrl('https://cimulate.ai.evil.com/x.umd.js')).toBe(false);
    });

    test('rejects an untrusted host', () => {
        expect(isTrustedWidgetScriptUrl('https://evil.example.com/x.umd.js')).toBe(false);
    });

    test('rejects a malformed URL', () => {
        expect(isTrustedWidgetScriptUrl('not a url')).toBe(false);
    });
});

describe('resolveWidgetScriptSrc', () => {
    test('returns the asset-resolved default when no override is set', () => {
        expect(resolveWidgetScriptSrc({})).toBe(`RESOLVED:${DEFAULT_WIDGET_SCRIPT_SRC}`);
    });

    test('returns the override as-is when it is on a trusted domain', () => {
        const url = 'https://cdn.search.cimulate.ai/inline-agent-widget/1.0.0/inline-agent-widget.umd.js';
        expect(resolveWidgetScriptSrc({ scriptSourceUrl: url })).toBe(url);
    });

    test('falls back to the self-host default when the override fails trust validation', () => {
        expect(resolveWidgetScriptSrc({ scriptSourceUrl: 'https://evil.example.com/x.umd.js' })).toBe(
            `RESOLVED:${DEFAULT_WIDGET_SCRIPT_SRC}`
        );
    });

    test('falls back when the override is HTTP (fails HTTPS gate)', () => {
        expect(resolveWidgetScriptSrc({ scriptSourceUrl: 'http://cimulate.ai/x.umd.js' })).toBe(
            `RESOLVED:${DEFAULT_WIDGET_SCRIPT_SRC}`
        );
    });
});

describe('parsePdpQuestions', () => {
    test('returns [] for non-string input', () => {
        expect(parsePdpQuestions(undefined)).toEqual([]);
        expect(parsePdpQuestions(null)).toEqual([]);
        expect(parsePdpQuestions(42)).toEqual([]);
        expect(parsePdpQuestions(['already', 'an', 'array'])).toEqual([]);
    });

    test('returns [] for invalid JSON', () => {
        expect(parsePdpQuestions('{not json')).toEqual([]);
    });

    test('returns [] when parsed JSON is not an array', () => {
        expect(parsePdpQuestions('{"q":"a"}')).toEqual([]);
        expect(parsePdpQuestions('"a plain string"')).toEqual([]);
    });

    test('parses, trims, dedupes', () => {
        const raw = JSON.stringify(['  How tall is it?  ', 'How tall is it?', 'Does it ship fast?']);
        expect(parsePdpQuestions(raw)).toEqual(['How tall is it?', 'Does it ship fast?']);
    });

    test('skips non-string and empty entries', () => {
        const raw = JSON.stringify(['Good', '', '   ', 7, null, 'Also good']);
        expect(parsePdpQuestions(raw)).toEqual(['Good', 'Also good']);
    });

    test('caps at MAX_PDP_QUESTIONS by default', () => {
        const raw = JSON.stringify(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
        const out = parsePdpQuestions(raw);
        expect(out).toHaveLength(MAX_PDP_QUESTIONS);
        expect(out).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    test('respects an explicit maxCount override', () => {
        const raw = JSON.stringify(['a', 'b', 'c', 'd']);
        expect(parsePdpQuestions(raw, 2)).toEqual(['a', 'b']);
    });
});

describe('exported defaults', () => {
    test('DEFAULT_WIDGET_SCRIPT_SRC targets the self-hosted UMD', () => {
        expect(DEFAULT_WIDGET_SCRIPT_SRC).toBe('/inline-agent-widget.umd.js');
    });

    test('DEFAULT_PRODUCT_ID_PATTERN matches the SF Next PDP grammar', () => {
        const re = new RegExp(DEFAULT_PRODUCT_ID_PATTERN);
        expect('/nto/en-US/p/500400?x=1'.match(re)?.[1]).toBe('500400');
        expect('/some/path'.match(re)).toBeNull();
    });

    test('DEFAULT_PRODUCT_ID_PATTERN captures the final segment on slugged SEO URLs', () => {
        const re = new RegExp(DEFAULT_PRODUCT_ID_PATTERN);
        expect('/nto/en-US/p/shoes/running/SKU-1'.match(re)?.[1]).toBe('SKU-1');
        expect('/nto/en-US/p/mens/jeans/501000#reviews'.match(re)?.[1]).toBe('501000');
        expect('/nto/en-US/p/current-slug/p1'.match(re)?.[1]).toBe('p1');
        // Category paths must not match.
        expect('/nto/en-US/c/mens'.match(re)).toBeNull();
    });

    test('DEFAULT_CAPABILITIES_VERSION is a stable string', () => {
        expect(typeof DEFAULT_CAPABILITIES_VERSION).toBe('string');
        expect(DEFAULT_CAPABILITIES_VERSION).not.toBe('');
    });
});
