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

afterEach(() => {
    vi.doUnmock('virtual:storefront-next/theme-breakpoints');
    vi.resetModules();
});

describe('theme breakpoints', () => {
    it('exposes the breakpoints the theme declares', async () => {
        vi.doMock('virtual:storefront-next/theme-breakpoints', () => ({
            default: { sm: '30rem', tablet: '700px' },
        }));
        const { breakpoints } = await import('./breakpoints');

        expect(breakpoints).toEqual({ sm: '30rem', tablet: '700px' });
    });

    it('builds a min-width media query from a named breakpoint', async () => {
        vi.doMock('virtual:storefront-next/theme-breakpoints', () => ({ default: { lg: '64rem' } }));
        const { minWidthQuery } = await import('./breakpoints');

        expect(minWidthQuery('lg')).toBe('(min-width: 64rem)');
    });

    it('is backed by the real theme in the app build, defining the breakpoints the template code needs', async () => {
        const { breakpoints } = await import('./breakpoints');

        expect(breakpoints).toEqual(
            expect.objectContaining({ md: expect.stringMatching(/^[\d.]+(px|rem|em)$/), lg: expect.any(String) })
        );
    });

    it('fails loudly when the theme does not define the breakpoint', async () => {
        vi.doMock('virtual:storefront-next/theme-breakpoints', () => ({ default: { tablet: '40rem' } }));
        const { minWidthQuery } = await import('./breakpoints');

        expect(() => minWidthQuery('lg')).toThrow(/--breakpoint-lg/);
    });

    it('does not mistake inherited object properties for breakpoints', async () => {
        vi.doMock('virtual:storefront-next/theme-breakpoints', () => ({ default: { md: '48rem' } }));
        const { minWidthQuery } = await import('./breakpoints');

        expect(() => minWidthQuery('toString')).toThrow(/--breakpoint-toString/);
    });
});

describe('warnUnknownBreakpoints', () => {
    async function load() {
        const warn = vi.fn();
        vi.doMock('@/lib/logger', () => ({ createLogger: () => ({ warn }) }));
        vi.doMock('virtual:storefront-next/theme-breakpoints', () => ({ default: { md: '48rem' } }));
        const { warnUnknownBreakpoints } = await import('./breakpoints');
        return { warn, warnUnknownBreakpoints };
    }

    afterEach(() => {
        vi.doUnmock('@/lib/logger');
        vi.unstubAllEnvs();
    });

    it('warns about names that are not known, listing the known ones', async () => {
        const { warn, warnUnknownBreakpoints } = await load();

        warnUnknownBreakpoints(['base', 'md', 'tablet'], ['base', 'md']);

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/"tablet".*Known: base, md/));
    });

    it('warns once per name', async () => {
        const { warn, warnUnknownBreakpoints } = await load();

        warnUnknownBreakpoints(['tablet'], ['md']);
        warnUnknownBreakpoints(['tablet', 'phablet'], ['md']);

        expect(warn).toHaveBeenCalledTimes(2);
    });

    it('stays silent when every name is known', async () => {
        const { warn, warnUnknownBreakpoints } = await load();

        warnUnknownBreakpoints(['md'], ['md']);

        expect(warn).not.toHaveBeenCalled();
    });

    it('does nothing outside development', async () => {
        vi.stubEnv('DEV', false);
        const { warn, warnUnknownBreakpoints } = await load();

        warnUnknownBreakpoints(['tablet'], ['md']);

        expect(warn).not.toHaveBeenCalled();
    });
});
