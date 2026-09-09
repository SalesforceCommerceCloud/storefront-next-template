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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { deepMerge, pathToObject, parseEnvValue, extractValidPaths, mergeEnvConfig } from './utils';

describe('deepMerge', () => {
    it('should merge two flat objects', () => {
        const target = { a: 1, b: 2 };
        const source = { b: 3, c: 4 };
        expect(deepMerge(target, source)).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('should merge nested objects', () => {
        const target = { a: { b: 1, c: 2 }, d: 3 };
        const source = { a: { b: 10, e: 5 }, f: 6 };
        expect(deepMerge(target, source)).toEqual({ a: { b: 10, c: 2, e: 5 }, d: 3, f: 6 });
    });

    it('should replace arrays instead of merging them', () => {
        const target = { arr: [1, 2, 3] };
        const source = { arr: [4, 5] };
        expect(deepMerge(target, source)).toEqual({ arr: [4, 5] });
    });

    it('should handle null and undefined values', () => {
        expect(deepMerge({ a: { b: 1 } }, { a: null })).toEqual({ a: null });
        expect(deepMerge({ a: 1, b: 2 }, { a: undefined })).toEqual({ a: undefined, b: 2 });
    });

    it('should not mutate input objects', () => {
        const target = { a: { b: 1 } };
        const source = { a: { c: 2 } };
        deepMerge(target, source);
        expect(target).toEqual({ a: { b: 1 } });
        expect(source).toEqual({ a: { c: 2 } });
    });
});

describe('pathToObject', () => {
    it('should convert multi-level path', () => {
        expect(pathToObject('app__pages__cart__maxQuantity', 999)).toEqual({
            app: { pages: { cart: { maxQuantity: 999 } } },
        });
    });

    it('should normalize keys to match baseConfig casing', () => {
        const baseConfig = { app: { site: { locale: 'en-US' } } };
        expect(pathToObject('APP__SITE__LOCALE', 'fr-FR', baseConfig)).toEqual({
            app: { site: { locale: 'fr-FR' } },
        });
    });

    it('should preserve original casing when no baseConfig provided', () => {
        expect(pathToObject('APP__SITE__LOCALE', 'fr-FR')).toEqual({
            APP: { SITE: { LOCALE: 'fr-FR' } },
        });
    });
});

describe('parseEnvValue', () => {
    it('should parse JSON primitives', () => {
        expect(parseEnvValue('42')).toBe(42);
        expect(parseEnvValue('true')).toBe(true);
        expect(parseEnvValue('"hello"')).toBe('hello');
    });

    it('should parse JSON arrays and objects', () => {
        expect(parseEnvValue('["a","b"]')).toEqual(['a', 'b']);
        expect(parseEnvValue('{"key":"value"}')).toEqual({ key: 'value' });
    });

    it('should fall back to string for non-JSON', () => {
        expect(parseEnvValue('hello')).toBe('hello');
    });
});

describe('extractValidPaths', () => {
    it('should extract leaf paths from nested object', () => {
        const obj = { app: { site: { locale: 'en-US' }, commerce: { api: { clientId: '' } } } };
        const paths = extractValidPaths(obj);
        expect(paths).toContain('app__site__locale');
        expect(paths).toContain('app__commerce__api__clientid');
    });
});

describe('mergeEnvConfig', () => {
    it('should merge PUBLIC__ prefixed variables', () => {
        const env = {
            PUBLIC__app__pages__cart__quantityUpdateDebounce: '1000',
            PUBLIC__app__pages__cart__maxQuantityPerItem: '500',
        };
        expect(mergeEnvConfig(env)).toEqual({
            app: { pages: { cart: { quantityUpdateDebounce: 1000, maxQuantityPerItem: 500 } } },
        });
    });

    it('should ignore variables without PUBLIC__ prefix', () => {
        const env = {
            PUBLIC__app__test: 'included',
            NOTPUBLIC__app__test: 'ignored',
            SERVER_SECRET: 'ignored',
        };
        expect(mergeEnvConfig(env)).toEqual({ app: { test: 'included' } });
    });

    it('should throw error for empty path after PUBLIC__ prefix', () => {
        expect(() => mergeEnvConfig({ PUBLIC__: 'value' })).toThrow('Path cannot be empty after PUBLIC__ prefix');
    });

    it('should throw error when variable name exceeds 512 characters', () => {
        const longPath = 'a'.repeat(520);
        expect(() => mergeEnvConfig({ [`PUBLIC__${longPath}`]: 'value' })).toThrow(
            'exceeds MRT limit of 512 characters'
        );
    });

    it('should throw error when total value size exceeds 32 KB', () => {
        const largeValue = 'x'.repeat(20 * 1024);
        expect(() => mergeEnvConfig({ PUBLIC__app__test1: largeValue, PUBLIC__app__test2: largeValue })).toThrow(
            'exceeds MRT limit of 32768 bytes'
        );
    });

    it('should throw error when path depth exceeds maximum', () => {
        expect(() => mergeEnvConfig({ PUBLIC__a__b__c__d__e__f__g__h__i__j__k: 'value' })).toThrow(
            'exceeds maximum path depth of 10'
        );
    });

    it('should warn and ignore env vars with paths not in baseConfig', () => {
        const baseConfig = { app: { site: { locale: 'en-US' } } };
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const result = mergeEnvConfig({ PUBLIC__app__invalid__path: 'value' }, baseConfig);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('does not exist in config.server.ts'));
        expect(result).toEqual({});
        warnSpy.mockRestore();
    });
});

describe('mergeEnvConfig - protectedPaths option', () => {
    const baseConfig = {
        app: {
            engagement: { adapters: { einstein: { enabled: true } } },
            site: { locale: 'en-US' },
        },
    };
    const options = { protectedPaths: ['app__engagement'] };

    it('should throw error when overriding a protected path', () => {
        const env = { PUBLIC__app__engagement__adapters__einstein__enabled: 'false' };
        expect(() => mergeEnvConfig(env, baseConfig, options)).toThrow('attempts to override protected config path');
    });

    it('should throw for sub-paths of protected paths (case-insensitive)', () => {
        const env = { PUBLIC__APP__ENGAGEMENT__ADAPTERS__EINSTEIN__ENABLED: 'false' };
        expect(() => mergeEnvConfig(env, baseConfig, options)).toThrow(
            'Protected paths cannot be overridden via environment variables'
        );
    });

    it('should throw when the protected path itself is not lowercase', () => {
        const mixedCaseOptions = { protectedPaths: ['app__url__seoRoutes'] };
        const env = { PUBLIC__app__url__seoRoutes: '{}' };
        expect(() => mergeEnvConfig(env, baseConfig, mixedCaseOptions)).toThrow(
            'attempts to override protected config path'
        );
    });

    it('should allow overriding non-protected paths', () => {
        const env = { PUBLIC__app__site__locale: 'fr-FR' };
        const result = mergeEnvConfig(env, baseConfig, options);
        expect((result as Record<string, Record<string, Record<string, string>>>).app.site.locale).toBe('fr-FR');
    });

    it('should not enforce protected paths when option is not provided', () => {
        const env = { PUBLIC__app__engagement__adapters__einstein__enabled: 'false' };
        expect(() => mergeEnvConfig(env, baseConfig)).not.toThrow();
    });
});

describe('mergeEnvConfig - Conflict Detection', () => {
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        process.env.NODE_ENV = 'development';
    });

    afterEach(() => {
        consoleWarnSpy.mockRestore();
        delete process.env.NODE_ENV;
    });

    it('should warn about conflicting parent and child paths in development', () => {
        mergeEnvConfig({
            PUBLIC__app__pages__cart: '{"maxQuantityPerItem":500}',
            PUBLIC__app__pages__cart__maxQuantityPerItem: '999',
        });

        expect(consoleWarnSpy).toHaveBeenCalledWith(
            expect.stringContaining('[Config Warning] Conflicting environment variables detected')
        );
    });

    it('should not warn in production mode', () => {
        process.env.NODE_ENV = 'production';
        mergeEnvConfig({
            PUBLIC__app__pages__cart: '{"maxQuantityPerItem":500}',
            PUBLIC__app__pages__cart__maxQuantityPerItem: '999',
        });
        expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
});
