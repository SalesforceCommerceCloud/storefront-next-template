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
import { describe, test, expect, vi, afterEach } from 'vitest';
import { validateRule } from './validate-rule';
import type { QualifierContext, VisibilityRuleDef } from './types';

const LOCALE = 'en_US';

const makeContext = (overrides: Partial<QualifierContext> = {}): QualifierContext => ({
    campaignQualifiers: {},
    customerGroups: {},
    ...overrides,
});

describe('validateRule', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    describe('campaign qualifiers', () => {
        test('passes when shopper has the required campaign qualifier', () => {
            const rule: VisibilityRuleDef = {
                activeLocales: [LOCALE],
                campaignQualifiers: [{ campaignId: 'summer-sale', promotionId: 'free-shipping' }],
            };
            const context = makeContext({
                campaignQualifiers: { 'summer-sale': { 'free-shipping': true } },
            });
            expect(validateRule(rule, LOCALE, context)).toBe(true);
        });

        test('fails when shopper lacks the campaign', () => {
            const rule: VisibilityRuleDef = {
                activeLocales: [LOCALE],
                campaignQualifiers: [{ campaignId: 'summer-sale', promotionId: 'free-shipping' }],
            };
            expect(validateRule(rule, LOCALE, makeContext())).toBe(false);
        });

        test('fails when shopper has campaign but wrong promotion', () => {
            const rule: VisibilityRuleDef = {
                activeLocales: [LOCALE],
                campaignQualifiers: [{ campaignId: 'summer-sale', promotionId: 'free-shipping' }],
            };
            const context = makeContext({
                campaignQualifiers: { 'summer-sale': { '10-percent-off': true } },
            });
            expect(validateRule(rule, LOCALE, context)).toBe(false);
        });

        test('all campaign qualifiers must match (AND logic)', () => {
            const rule: VisibilityRuleDef = {
                activeLocales: [LOCALE],
                campaignQualifiers: [
                    { campaignId: 'summer-sale', promotionId: 'free-shipping' },
                    { campaignId: 'loyalty', promotionId: 'double-points' },
                ],
            };
            const partialContext = makeContext({
                campaignQualifiers: { 'summer-sale': { 'free-shipping': true } },
            });
            expect(validateRule(rule, LOCALE, partialContext)).toBe(false);

            const fullContext = makeContext({
                campaignQualifiers: {
                    'summer-sale': { 'free-shipping': true },
                    loyalty: { 'double-points': true },
                },
            });
            expect(validateRule(rule, LOCALE, fullContext)).toBe(true);
        });

        test('fails when no context is provided', () => {
            const rule: VisibilityRuleDef = {
                activeLocales: [LOCALE],
                campaignQualifiers: [{ campaignId: 'sale', promotionId: 'promo' }],
            };
            expect(validateRule(rule, LOCALE, null)).toBe(false);
            expect(validateRule(rule, LOCALE, undefined)).toBe(false);
        });
    });

    describe('activeLocales', () => {
        test('fails when the current locale is not in activeLocales', () => {
            const rule: VisibilityRuleDef = { activeLocales: ['fr_FR'] };
            expect(validateRule(rule, LOCALE)).toBe(false);
        });

        test('fails when activeLocales is empty', () => {
            const rule: VisibilityRuleDef = { activeLocales: [] };
            expect(validateRule(rule, LOCALE)).toBe(false);
        });

        test('fails when activeLocales does not include locale even with passing schedule and customer groups', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-06-15T00:00:00.000Z'));

            const rule: VisibilityRuleDef = {
                activeLocales: ['fr_FR'],
                customerGroups: ['vip'],
                schedule: {
                    start: '2026-06-01T00:00:00.000Z',
                    end: '2026-06-30T00:00:00.000Z',
                },
            };
            const context = makeContext({ customerGroups: { vip: true } });
            expect(validateRule(rule, LOCALE, context)).toBe(false);
        });

        test('passes for any locale when activeLocales is null', () => {
            const rule: VisibilityRuleDef = { activeLocales: null };
            expect(validateRule(rule, LOCALE)).toBe(true);
            expect(validateRule(rule, 'fr_FR')).toBe(true);
            expect(validateRule(rule, 'de_DE')).toBe(true);
        });

        test('passes when the current locale is in activeLocales and no other conditions', () => {
            const rule: VisibilityRuleDef = { activeLocales: [LOCALE] };
            expect(validateRule(rule, LOCALE)).toBe(true);
        });

        test('passes when activeLocales contains multiple locales including the current one', () => {
            const rule: VisibilityRuleDef = { activeLocales: ['fr_FR', LOCALE, 'de_DE'] };
            expect(validateRule(rule, LOCALE)).toBe(true);
        });

        test('is not checked for campaign-based rules', () => {
            const rule: VisibilityRuleDef = {
                activeLocales: [],
                campaignQualifiers: [{ campaignId: 'sale', promotionId: 'promo' }],
            };
            const context = makeContext({
                campaignQualifiers: { sale: { promo: true } },
            });
            expect(validateRule(rule, LOCALE, context)).toBe(true);
        });
    });

    describe('customer groups', () => {
        test('passes when shopper belongs to the required group', () => {
            const rule: VisibilityRuleDef = { activeLocales: [LOCALE], customerGroups: ['vip'] };
            const context = makeContext({ customerGroups: { vip: true } });
            expect(validateRule(rule, LOCALE, context)).toBe(true);
        });

        test('fails when shopper does not belong to the group', () => {
            const rule: VisibilityRuleDef = { activeLocales: [LOCALE], customerGroups: ['vip'] };
            expect(validateRule(rule, LOCALE, makeContext())).toBe(false);
        });

        test('all customer groups must match (AND logic)', () => {
            const rule: VisibilityRuleDef = {
                activeLocales: [LOCALE],
                customerGroups: ['vip', 'early-access'],
            };
            const partial = makeContext({ customerGroups: { vip: true } });
            expect(validateRule(rule, LOCALE, partial)).toBe(false);

            const full = makeContext({ customerGroups: { vip: true, 'early-access': true } });
            expect(validateRule(rule, LOCALE, full)).toBe(true);
        });

        test('fails when no context is provided', () => {
            const rule: VisibilityRuleDef = { activeLocales: [LOCALE], customerGroups: ['vip'] };
            expect(validateRule(rule, LOCALE, null)).toBe(false);
        });
    });

    describe('schedule', () => {
        test('passes when current time is within the window', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-06-15T00:00:00.000Z'));

            const rule: VisibilityRuleDef = {
                activeLocales: [LOCALE],
                schedule: {
                    start: '2026-06-01T00:00:00.000Z',
                    end: '2026-06-30T00:00:00.000Z',
                },
            };
            expect(validateRule(rule, LOCALE)).toBe(true);
        });

        test('fails when current time is before the start', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-05-15T00:00:00.000Z'));

            const rule: VisibilityRuleDef = {
                activeLocales: [LOCALE],
                schedule: { start: '2026-06-01T00:00:00.000Z' },
            };
            expect(validateRule(rule, LOCALE)).toBe(false);
        });

        test('fails when current time is after the end', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-07-15T00:00:00.000Z'));

            const rule: VisibilityRuleDef = {
                activeLocales: [LOCALE],
                schedule: { end: '2026-06-30T00:00:00.000Z' },
            };
            expect(validateRule(rule, LOCALE)).toBe(false);
        });

        test('passes when only start is set and current time is after it', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-07-01T00:00:00.000Z'));

            const rule: VisibilityRuleDef = {
                activeLocales: [LOCALE],
                schedule: { start: '2026-06-01T00:00:00.000Z' },
            };
            expect(validateRule(rule, LOCALE)).toBe(true);
        });

        test('passes when only end is set and current time is before it', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-05-01T00:00:00.000Z'));

            const rule: VisibilityRuleDef = {
                activeLocales: [LOCALE],
                schedule: { end: '2026-06-30T00:00:00.000Z' },
            };
            expect(validateRule(rule, LOCALE)).toBe(true);
        });

        test('does not require context for schedule-only rules', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-06-15T00:00:00.000Z'));

            const rule: VisibilityRuleDef = {
                activeLocales: [LOCALE],
                schedule: {
                    start: '2026-06-01T00:00:00.000Z',
                    end: '2026-06-30T00:00:00.000Z',
                },
            };
            expect(validateRule(rule, LOCALE, null)).toBe(true);
        });

        test('fails when current time equals start (start-exclusive)', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));

            const rule: VisibilityRuleDef = {
                activeLocales: [LOCALE],
                schedule: {
                    start: '2026-06-01T00:00:00.000Z',
                    end: '2026-06-30T00:00:00.000Z',
                },
            };
            expect(validateRule(rule, LOCALE)).toBe(false);
        });

        test('fails when current time equals end (end-exclusive)', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-06-30T00:00:00.000Z'));

            const rule: VisibilityRuleDef = {
                activeLocales: [LOCALE],
                schedule: {
                    start: '2026-06-01T00:00:00.000Z',
                    end: '2026-06-30T00:00:00.000Z',
                },
            };
            expect(validateRule(rule, LOCALE)).toBe(false);
        });

        test('fails when start is an invalid date string', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-06-15T00:00:00.000Z'));

            const rule: VisibilityRuleDef = {
                activeLocales: [LOCALE],
                schedule: { start: 'not-a-date' },
            };
            expect(validateRule(rule, LOCALE)).toBe(false);
        });

        test('fails when end is an invalid date string', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-06-15T00:00:00.000Z'));

            const rule: VisibilityRuleDef = {
                activeLocales: [LOCALE],
                schedule: { end: 'not-a-date' },
            };
            expect(validateRule(rule, LOCALE)).toBe(false);
        });

        test('passes when schedule object has no start or end', () => {
            const rule: VisibilityRuleDef = {
                activeLocales: [LOCALE],
                schedule: {},
            };
            expect(validateRule(rule, LOCALE)).toBe(true);
        });
    });

    describe('schedule with context.currentTime', () => {
        // When `currentTime` is supplied on the context it overrides `Date.now()`
        // for schedule evaluation, so the outcome must not depend on the wall
        // clock. Pin the real clock far outside every window below to prove the
        // decision comes from `currentTime`, not the ambient time.
        const REAL_NOW = new Date('2020-01-01T00:00:00.000Z');
        const at = (iso: string) => new Date(iso).getTime();

        const windowRule: VisibilityRuleDef = {
            activeLocales: [LOCALE],
            schedule: {
                start: '2026-06-01T00:00:00.000Z',
                end: '2026-06-30T00:00:00.000Z',
            },
        };

        test('uses currentTime instead of Date.now() when within the window', () => {
            vi.useFakeTimers();
            vi.setSystemTime(REAL_NOW);

            const context = { ...makeContext(), currentTime: at('2026-06-15T00:00:00.000Z') };
            expect(validateRule(windowRule, LOCALE, context)).toBe(true);
        });

        test('fails when currentTime is before the start (even though Date.now() would also fail)', () => {
            vi.useFakeTimers();
            vi.setSystemTime(REAL_NOW);

            const context = { ...makeContext(), currentTime: at('2026-05-15T00:00:00.000Z') };
            expect(validateRule(windowRule, LOCALE, context)).toBe(false);
        });

        test('fails when currentTime is after the end', () => {
            vi.useFakeTimers();
            vi.setSystemTime(REAL_NOW);

            const context = { ...makeContext(), currentTime: at('2026-07-15T00:00:00.000Z') };
            expect(validateRule(windowRule, LOCALE, context)).toBe(false);
        });

        test('currentTime overrides a Date.now() that would otherwise pass', () => {
            // Wall clock sits inside the window, but currentTime does not — the
            // rule must fail, proving currentTime wins over Date.now().
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-06-15T00:00:00.000Z'));

            const context = { ...makeContext(), currentTime: at('2027-01-01T00:00:00.000Z') };
            expect(validateRule(windowRule, LOCALE, context)).toBe(false);
        });

        test('falls back to Date.now() when currentTime is absent', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-06-15T00:00:00.000Z'));

            // Context present (customer group path) but no currentTime — schedule
            // still evaluates against the wall clock, which is inside the window.
            expect(validateRule(windowRule, LOCALE, makeContext())).toBe(true);
        });

        test('respects currentTime of 0 rather than treating it as absent (?? not ||)', () => {
            // currentTime === 0 is the Unix epoch — a real, falsy timestamp. The
            // `?? Date.now()` guard must keep it; a `|| Date.now()` bug would fall
            // back to the wall clock. Epoch is before the window's start, so the
            // rule fails; a bug would make it pass against the in-window clock.
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-06-15T00:00:00.000Z'));

            const context = { ...makeContext(), currentTime: 0 };
            expect(validateRule(windowRule, LOCALE, context)).toBe(false);
        });
    });

    describe('campaign-based rules ignore schedule, customer groups, and activeLocales', () => {
        test('passes when campaign matches, even if customer group would fail', () => {
            const rule: VisibilityRuleDef = {
                activeLocales: [],
                campaignQualifiers: [{ campaignId: 'sale', promotionId: 'promo' }],
                customerGroups: ['vip'],
            };
            const context = makeContext({
                campaignQualifiers: { sale: { promo: true } },
                // shopper is NOT in the 'vip' group, but campaign path takes precedence
            });
            expect(validateRule(rule, LOCALE, context)).toBe(true);
        });

        test('passes when campaign matches, even if schedule would fail', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

            const rule: VisibilityRuleDef = {
                activeLocales: [],
                campaignQualifiers: [{ campaignId: 'sale', promotionId: 'promo' }],
                schedule: {
                    start: '2026-06-01T00:00:00.000Z',
                    end: '2026-06-30T00:00:00.000Z',
                },
            };
            const context = makeContext({
                campaignQualifiers: { sale: { promo: true } },
            });
            expect(validateRule(rule, LOCALE, context)).toBe(true);
        });
    });

    describe('non-campaign rules check activeLocales, schedule, AND customer groups', () => {
        test('fails when schedule passes but customer group fails', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-06-15T00:00:00.000Z'));

            const rule: VisibilityRuleDef = {
                activeLocales: [LOCALE],
                customerGroups: ['vip'],
                schedule: {
                    start: '2026-06-01T00:00:00.000Z',
                    end: '2026-06-30T00:00:00.000Z',
                },
            };
            expect(validateRule(rule, LOCALE, makeContext())).toBe(false);
        });

        test('fails when customer group passes but schedule fails', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

            const rule: VisibilityRuleDef = {
                activeLocales: [LOCALE],
                customerGroups: ['vip'],
                schedule: {
                    start: '2026-06-01T00:00:00.000Z',
                    end: '2026-06-30T00:00:00.000Z',
                },
            };
            const context = makeContext({ customerGroups: { vip: true } });
            expect(validateRule(rule, LOCALE, context)).toBe(false);
        });

        test('passes when both schedule and customer group pass', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-06-15T00:00:00.000Z'));

            const rule: VisibilityRuleDef = {
                activeLocales: [LOCALE],
                customerGroups: ['vip'],
                schedule: {
                    start: '2026-06-01T00:00:00.000Z',
                    end: '2026-06-30T00:00:00.000Z',
                },
            };
            const context = makeContext({ customerGroups: { vip: true } });
            expect(validateRule(rule, LOCALE, context)).toBe(true);
        });
    });

    describe('empty / absent rule fields', () => {
        test('passes when rule has no conditions besides activeLocales', () => {
            expect(validateRule({ activeLocales: [LOCALE] }, LOCALE)).toBe(true);
        });

        test('passes when rule has empty arrays', () => {
            const rule: VisibilityRuleDef = {
                activeLocales: [LOCALE],
                campaignQualifiers: [],
                customerGroups: [],
            };
            expect(validateRule(rule, LOCALE, makeContext())).toBe(true);
        });
    });
});
