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
import { describe, it, expect } from 'vitest';
import { envKeyToConfigPath, configPathToEnvKey, getValueSources, formatInspectOutput } from './inspect-utils.js';

describe('commands/config/inspect-utils', () => {
    describe('envKeyToConfigPath', () => {
        it('converts PUBLIC__ env key to dot-notation config path', () => {
            expect(envKeyToConfigPath('PUBLIC__app__commerce__api__clientId')).toBe('app.commerce.api.clientId');
        });

        it('converts single-segment key', () => {
            expect(envKeyToConfigPath('PUBLIC__app')).toBe('app');
        });

        it('converts deeply nested key', () => {
            expect(envKeyToConfigPath('PUBLIC__app__site__features__socialLogin__providers')).toBe(
                'app.site.features.socialLogin.providers'
            );
        });

        it('strips the PUBLIC__ prefix', () => {
            const result = envKeyToConfigPath('PUBLIC__app__commerce__api__siteId');
            expect(result).not.toContain('PUBLIC');
            expect(result).toBe('app.commerce.api.siteId');
        });
    });

    describe('configPathToEnvKey', () => {
        it('converts dot-notation config path to PUBLIC__ env key', () => {
            expect(configPathToEnvKey('app.commerce.api.clientId')).toBe('PUBLIC__app__commerce__api__clientId');
        });

        it('converts single-segment path', () => {
            expect(configPathToEnvKey('app')).toBe('PUBLIC__app');
        });

        it('round-trips with envKeyToConfigPath', () => {
            const original = 'PUBLIC__app__site__features__socialLogin__providers';
            expect(configPathToEnvKey(envKeyToConfigPath(original))).toBe(original);
        });
    });

    describe('getValueSources', () => {
        it('tags values as .env when matching PUBLIC__ key exists', () => {
            const flattenedKeys = ['app.commerce.api.clientId', 'app.site.locale'];
            const envKeys = new Set(['PUBLIC__app__commerce__api__clientId']);
            const result = getValueSources(flattenedKeys, envKeys);
            expect(result.get('app.commerce.api.clientId')).toBe('.env');
        });

        it('tags values as config when no matching PUBLIC__ key exists', () => {
            const flattenedKeys = ['app.commerce.api.clientId', 'app.site.locale'];
            const envKeys = new Set<string>();
            const result = getValueSources(flattenedKeys, envKeys);
            expect(result.get('app.commerce.api.clientId')).toBe('config');
            expect(result.get('app.site.locale')).toBe('config');
        });

        it('mixes config and .env sources correctly', () => {
            const flattenedKeys = ['app.commerce.api.clientId', 'app.site.locale', 'metadata.projectName'];
            const envKeys = new Set(['PUBLIC__app__site__locale']);
            const result = getValueSources(flattenedKeys, envKeys);
            expect(result.get('app.commerce.api.clientId')).toBe('config');
            expect(result.get('app.site.locale')).toBe('.env');
            expect(result.get('metadata.projectName')).toBe('config');
        });
    });

    describe('formatInspectOutput', () => {
        // oxlint-disable-next-line no-control-regex
        const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

        describe('Config Summary section', () => {
            it('includes total value count and override count in summary line', () => {
                const flatConfig = [
                    { key: 'app.site.locale', value: 'en-US' },
                    { key: 'app.commerce.api.clientId', value: 'abc123' },
                ];
                const sources = new Map([
                    ['app.site.locale', '.env'],
                    ['app.commerce.api.clientId', 'config'],
                ]);
                const output = formatInspectOutput({ flatConfig, sources, localVars: new Map(), mrtVars: null });
                const stripped = strip(output);
                expect(stripped).toContain('2 values');
                expect(stripped).toContain('1 overridden by .env');
            });

            it('shows "(no config loaded)" when flatConfig is empty', () => {
                const output = formatInspectOutput({
                    flatConfig: [],
                    sources: new Map(),
                    localVars: new Map(),
                    mrtVars: null,
                });
                expect(strip(output)).toContain('no config loaded');
            });
        });

        describe('.env Overrides section', () => {
            it('shows .env-overridden config paths', () => {
                const flatConfig = [
                    { key: 'app.site.locale', value: 'en-US' },
                    { key: 'app.commerce.api.clientId', value: 'abc123' },
                ];
                const sources = new Map([
                    ['app.site.locale', '.env'],
                    ['app.commerce.api.clientId', 'config'],
                ]);
                const output = formatInspectOutput({ flatConfig, sources, localVars: new Map(), mrtVars: null });
                expect(strip(output)).toContain('app.site.locale');
            });

            it('shows "(no .env overrides)" when no config paths are overridden', () => {
                const output = formatInspectOutput({
                    flatConfig: [{ key: 'app.foo', value: 'bar' }],
                    sources: new Map([['app.foo', 'config']]),
                    localVars: new Map(),
                    mrtVars: null,
                });
                expect(strip(output)).toContain('no .env overrides');
            });

            it('config-only values do not appear in output', () => {
                const output = formatInspectOutput({
                    flatConfig: [
                        { key: 'app.site.locale', value: 'en-US' },
                        { key: 'app.unreferenced.default', value: 42 },
                    ],
                    sources: new Map([
                        ['app.site.locale', '.env'],
                        ['app.unreferenced.default', 'config'],
                    ]),
                    localVars: new Map(),
                    mrtVars: null,
                });
                expect(strip(output)).not.toContain('app.unreferenced.default');
            });

            it('shows [local only] tag for overrides not present in MRT', () => {
                const output = formatInspectOutput({
                    flatConfig: [
                        { key: 'app.site.locale', value: 'en-US' },
                        { key: 'app.commerce.api.clientId', value: 'abc123' },
                    ],
                    sources: new Map([
                        ['app.site.locale', '.env'],
                        ['app.commerce.api.clientId', '.env'],
                    ]),
                    localVars: new Map([
                        ['PUBLIC__app__site__locale', 'en-US'],
                        ['PUBLIC__app__commerce__api__clientId', 'abc123'],
                    ]),
                    // MRT has locale but not clientId
                    mrtVars: new Map([['PUBLIC__app__site__locale', '****************-US']]),
                });
                const stripped = strip(output);
                const lines = stripped.split('\n');
                const clientIdLine = lines.find((l) => l.includes('app.commerce.api.clientId'));
                // Find the .env Overrides line for locale (JSON-stringified value distinguishes it from MRT section)
                const localeLine = lines.find((l) => l.includes('app.site.locale') && l.includes('"en-US"'));
                expect(clientIdLine).toContain('[local only]');
                expect(localeLine).not.toContain('[local only]');
            });

            it('shows no [local only] tag when mrtVars is null', () => {
                const output = formatInspectOutput({
                    flatConfig: [{ key: 'app.site.locale', value: 'en-US' }],
                    sources: new Map([['app.site.locale', '.env']]),
                    localVars: new Map([['PUBLIC__app__site__locale', 'en-US']]),
                    mrtVars: null,
                });
                expect(strip(output)).not.toContain('[local only]');
            });

            it('entries are sorted alphabetically by config path', () => {
                const flatConfig = [
                    { key: 'app.z.last', value: 'z' },
                    { key: 'app.a.first', value: 'a' },
                    { key: 'app.m.middle', value: 'm' },
                ];
                const sources = new Map([
                    ['app.z.last', '.env'],
                    ['app.a.first', '.env'],
                    ['app.m.middle', '.env'],
                ]);
                const output = formatInspectOutput({ flatConfig, sources, localVars: new Map(), mrtVars: null });
                const stripped = strip(output);
                expect(stripped.indexOf('app.a.first')).toBeLessThan(stripped.indexOf('app.m.middle'));
                expect(stripped.indexOf('app.m.middle')).toBeLessThan(stripped.indexOf('app.z.last'));
            });
        });

        describe('MRT Overrides section', () => {
            it('shows PUBLIC__ MRT vars as config paths with their values', () => {
                const output = formatInspectOutput({
                    flatConfig: [],
                    sources: new Map(),
                    localVars: new Map(),
                    mrtVars: new Map([
                        ['PUBLIC__app__site__locale', '****************-US'],
                        ['PUBLIC__app__commerce__api__clientId', '****************123'],
                    ]),
                });
                const stripped = strip(output);
                expect(stripped).toContain('MRT Overrides');
                expect(stripped).toContain('app.site.locale');
                expect(stripped).toContain('app.commerce.api.clientId');
                expect(stripped).toContain('****************-US');
                expect(stripped).toContain('****************123');
            });

            it('shows [MRT only] tag for MRT overrides not present in local .env', () => {
                const output = formatInspectOutput({
                    flatConfig: [],
                    sources: new Map(),
                    // localVars has locale but not clientId
                    localVars: new Map([['PUBLIC__app__site__locale', 'en-US']]),
                    mrtVars: new Map([
                        ['PUBLIC__app__site__locale', '****************-US'],
                        ['PUBLIC__app__commerce__api__clientId', '****************123'],
                    ]),
                });
                const stripped = strip(output);
                const lines = stripped.split('\n');
                const clientIdLine = lines.find((l) => l.includes('app.commerce.api.clientId'));
                // Find the MRT Overrides line for locale (raw masked value distinguishes it from .env section)
                const localeLine = lines.find((l) => l.includes('app.site.locale') && l.includes('***'));
                expect(clientIdLine).toContain('[MRT only]');
                expect(localeLine).not.toContain('[MRT only]');
            });

            it('filters out non-PUBLIC__ MRT vars', () => {
                const output = formatInspectOutput({
                    flatConfig: [],
                    sources: new Map(),
                    localVars: new Map(),
                    mrtVars: new Map([
                        ['PUBLIC__app__site__locale', '****************-US'],
                        ['SOME_INTERNAL_VAR', 'value'],
                        ['MRT_PROJECT', 'my-project'],
                    ]),
                });
                const stripped = strip(output);
                expect(stripped).toContain('app.site.locale');
                expect(stripped).not.toContain('SOME_INTERNAL_VAR');
                expect(stripped).not.toContain('MRT_PROJECT');
            });

            it('shows "(no MRT config overrides)" when MRT has no PUBLIC__ vars', () => {
                const output = formatInspectOutput({
                    flatConfig: [],
                    sources: new Map(),
                    localVars: new Map(),
                    mrtVars: new Map([['SOME_INTERNAL_VAR', 'value']]),
                });
                expect(strip(output)).toContain('no MRT config overrides');
            });

            it('skips MRT Overrides section when mrtVars is null', () => {
                const output = formatInspectOutput({
                    flatConfig: [],
                    sources: new Map(),
                    localVars: new Map(),
                    mrtVars: null,
                });
                expect(strip(output)).not.toContain('MRT Overrides');
            });

            it('entries are sorted alphabetically by config path', () => {
                const output = formatInspectOutput({
                    flatConfig: [],
                    sources: new Map(),
                    localVars: new Map(),
                    mrtVars: new Map([
                        ['PUBLIC__app__z__last', '***z'],
                        ['PUBLIC__app__a__first', '***a'],
                        ['PUBLIC__app__m__middle', '***m'],
                    ]),
                });
                const stripped = strip(output);
                expect(stripped.indexOf('app.a.first')).toBeLessThan(stripped.indexOf('app.m.middle'));
                expect(stripped.indexOf('app.m.middle')).toBeLessThan(stripped.indexOf('app.z.last'));
            });
        });
    });
});
