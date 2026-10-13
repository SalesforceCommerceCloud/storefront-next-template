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
import { describe, expect, it, vi } from 'vitest';
import { formatCurrency, getCurrencyFractionDigits, getCurrencySymbol } from './currency';

describe('formatCurrency', () => {
    describe('en-GB with GBP', () => {
        it('should format a whole number', () => {
            const result = formatCurrency(100, 'en-GB', 'GBP');
            expect(result).toBe('£100.00');
        });

        it('should format a decimal number', () => {
            const result = formatCurrency(99.99, 'en-GB', 'GBP');
            expect(result).toBe('£99.99');
        });

        it('should format zero', () => {
            const result = formatCurrency(0, 'en-GB', 'GBP');
            expect(result).toBe('£0.00');
        });

        it('should format negative numbers', () => {
            const result = formatCurrency(-50, 'en-GB', 'GBP');
            expect(result).toBe('-£50.00');
        });

        it('should format large numbers with grouping', () => {
            const result = formatCurrency(1234567.89, 'en-GB', 'GBP');
            expect(result).toBe('£1,234,567.89');
        });

        it('should round to two decimal places', () => {
            const result = formatCurrency(10.999, 'en-GB', 'GBP');
            expect(result).toBe('£11.00');
        });
    });

    describe('different locales', () => {
        it('should format for de-DE locale', () => {
            const result = formatCurrency(1234.56, 'de-DE', 'EUR');
            expect(result).toMatch(/1.234,56\s?€/);
        });

        it('should format for fr-FR locale', () => {
            const result = formatCurrency(1234.56, 'fr-FR', 'EUR');
            // French uses narrow non-breaking space as grouping separator
            expect(result).toMatch(/1\s?234,56\s?€/);
        });

        it('should format for en-GB locale with GBP', () => {
            const result = formatCurrency(1234.56, 'en-GB', 'GBP');
            expect(result).toBe('£1,234.56');
        });

        it('should format for ja-JP locale with JPY', () => {
            const result = formatCurrency(1234, 'ja-JP', 'JPY');
            // JPY has no decimal places
            expect(result).toBe('￥1,234');
        });
    });

    describe('different currencies', () => {
        it('should format EUR currency', () => {
            const result = formatCurrency(100, 'en-US', 'EUR');
            expect(result).toBe('€100.00');
        });

        it('should format GBP currency', () => {
            const result = formatCurrency(100, 'en-US', 'GBP');
            expect(result).toBe('£100.00');
        });

        it('should format CHF currency', () => {
            const result = formatCurrency(100, 'de-CH', 'CHF');
            expect(result).toMatch(/CHF\s?100\.00/);
        });

        it('should format CAD currency', () => {
            const result = formatCurrency(100, 'en-CA', 'CAD');
            expect(result).toBe('$100.00');
        });
    });

    describe('edge cases', () => {
        it('should handle very small numbers', () => {
            const result = formatCurrency(0.01, 'en-GB', 'GBP');
            expect(result).toBe('£0.01');
        });

        it('should handle very large numbers', () => {
            const result = formatCurrency(999999999.99, 'en-GB', 'GBP');
            expect(result).toBe('£999,999,999.99');
        });

        it('should handle NaN', () => {
            const result = formatCurrency(NaN, 'en-GB', 'GBP');
            expect(result).toBe('£NaN');
        });

        it('should handle Infinity', () => {
            const result = formatCurrency(Infinity, 'en-GB', 'GBP');
            expect(result).toBe('£∞');
        });

        it('should handle negative Infinity', () => {
            const result = formatCurrency(-Infinity, 'en-GB', 'GBP');
            expect(result).toBe('-£∞');
        });
    });

    describe('getCurrencySymbol', () => {
        it('should return $ for USD', () => {
            expect(getCurrencySymbol('en-US', 'USD')).toBe('$');
        });

        it('should return £ for GBP', () => {
            expect(getCurrencySymbol('en-GB', 'GBP')).toBe('£');
        });

        it('should return € for EUR', () => {
            expect(getCurrencySymbol('en-US', 'EUR')).toBe('€');
        });

        it('should return yen symbol for JPY', () => {
            expect(getCurrencySymbol('ja-JP', 'JPY')).toMatch(/[¥￥]/);
        });

        it('should return $ for CAD with en-CA locale', () => {
            expect(getCurrencySymbol('en-CA', 'CAD')).toBe('$');
        });

        it('should return CHF for Swiss francs', () => {
            expect(getCurrencySymbol('de-CH', 'CHF')).toMatch(/CHF/);
        });
    });

    describe('getCurrencyFractionDigits', () => {
        it('returns the display precision for zero- and two-decimal currencies', () => {
            expect(getCurrencyFractionDigits('JPY')).toBe(0);
            expect(getCurrencyFractionDigits('USD')).toBe(2);
        });
    });

    describe('caching behavior', () => {
        let calls: Array<[string | undefined, Intl.NumberFormatOptions | undefined]>;

        beforeEach(() => {
            vi.resetModules();

            const OriginalNumberFormat = Intl.NumberFormat;
            calls = [];

            function SpyNumberFormat(this: Intl.NumberFormat, locale?: string, options?: Intl.NumberFormatOptions) {
                calls.push([locale, options]);
                return new OriginalNumberFormat(locale, options);
            }
            vi.stubGlobal('Intl', { ...Intl, NumberFormat: SpyNumberFormat });
        });

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it('should only create new Intl.NumberFormat for unique locale-currency combinations', async () => {
            const { formatCurrency: format } = await import('./currency');

            format(100, 'pt-BR', 'BRL');
            format(200, 'pt-BR', 'BRL');
            format(300, 'pt-BR', 'BRL');

            // Should only create one formatter for the same locale-currency combination
            expect(calls).toHaveLength(1);
            const brlCalls = calls.filter((call) => call[0] === 'pt-BR' && call[1]?.currency === 'BRL');
            expect(brlCalls).toHaveLength(1);
        });

        it('should create separate formatters for different currencies', async () => {
            const { formatCurrency: format } = await import('./currency');

            format(100, 'sv-SE', 'SEK');
            format(100, 'sv-SE', 'NOK');

            expect(calls).toHaveLength(2);
            const sekCalls = calls.filter((call) => call[0] === 'sv-SE' && call[1]?.currency === 'SEK');
            const nokCalls = calls.filter((call) => call[0] === 'sv-SE' && call[1]?.currency === 'NOK');

            expect(sekCalls).toHaveLength(1);
            expect(nokCalls).toHaveLength(1);
        });

        it('should create separate formatters for different locales', async () => {
            const { formatCurrency: format } = await import('./currency');

            format(100, 'pl-PL', 'PLN');
            format(100, 'cs-CZ', 'PLN');

            expect(calls).toHaveLength(2);
            const plCalls = calls.filter((call) => call[0] === 'pl-PL' && call[1]?.currency === 'PLN');
            const czCalls = calls.filter((call) => call[0] === 'cs-CZ' && call[1]?.currency === 'PLN');

            expect(plCalls).toHaveLength(1);
            expect(czCalls).toHaveLength(1);
        });
    });
});
