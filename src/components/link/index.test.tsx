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
import { createRef } from 'react';
import { cleanup, render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, test, vi } from 'vitest';
import i18next from 'i18next';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { Link, NavLink } from './index';

function renderWithRouter(ui: React.ReactElement) {
    const router = createMemoryRouter([{ path: '*', element: <AllProvidersWrapper>{ui}</AllProvidersWrapper> }], {
        initialEntries: ['/'],
    });
    return render(<RouterProvider router={router} />);
}

describe('Link', () => {
    afterEach(async () => {
        cleanup();
        await i18next.changeLanguage('en-GB');
    });

    test('renders a site context prefixed URL', () => {
        const { getByRole } = renderWithRouter(<Link to="/product/123">Product</Link>);

        expect(getByRole('link')).toHaveAttribute('href', '/global/en-GB/product/123');
    });

    test('passes through an object `to` prop without transformation', () => {
        const { getByRole } = renderWithRouter(
            <Link to={{ pathname: '/product/123', search: '?color=red' }}>Product</Link>
        );

        expect(getByRole('link')).toHaveAttribute('href', '/product/123?color=red');
    });

    test('forwards a ref to the anchor element', () => {
        const ref = createRef<HTMLAnchorElement>();
        renderWithRouter(
            <Link to="/test" ref={ref}>
                Test
            </Link>
        );

        expect(ref.current).toBeInstanceOf(HTMLAnchorElement);
    });

    test('uses the current i18n language for locale segment', async () => {
        await i18next.changeLanguage('it-IT');

        const { getByRole } = renderWithRouter(<Link to="/product/123">Product</Link>);

        expect(getByRole('link')).toHaveAttribute('href', '/global/it-IT/product/123');
    });

    test('passes additional props to the rendered anchor', () => {
        const { getByRole } = renderWithRouter(
            <Link to="/test" className="my-link" data-testid="custom">
                Test
            </Link>
        );

        const link = getByRole('link');
        expect(link).toHaveClass('my-link');
        expect(link).toHaveAttribute('data-testid', 'custom');
    });

    test('prefixes root path "/" with site context', () => {
        const { getByRole } = renderWithRouter(<Link to="/">Home</Link>);

        expect(getByRole('link')).toHaveAttribute('href', '/global/en-GB/');
    });

    test('renders a scheme-less external domain as an absolute https link (no site prefix)', () => {
        // Page Designer merchants typically type a bare domain (e.g. `www.google.com`) into an
        // external-link field. It must become a real cross-origin href, not a site-prefixed path
        // like `/global/en-GBwww.google.com`.
        const { getByRole } = renderWithRouter(<Link to="www.google.com">External</Link>);

        expect(getByRole('link')).toHaveAttribute('href', 'https://www.google.com');
    });

    test('leaves a fully-qualified external URL untouched', () => {
        const { getByRole } = renderWithRouter(<Link to="https://www.example.com/foo">External</Link>);

        expect(getByRole('link')).toHaveAttribute('href', 'https://www.example.com/foo');
    });
});

// Hybrid legacy-route tests: stub useConfig to turn hybrid ON with a configurable legacyRoutes
// list. The mock delegates to the REAL useConfig unless a test sets `hybridConfigRef.active`, so
// the existing (non-hybrid) tests above are unaffected. useSite stays real (AllProvidersWrapper
// supplies it), so buildUrl/stripPathPrefix run for real — only the config is swapped.
const hybridConfigRef: { active: boolean; legacyRoutes: unknown[]; prefix: string } = {
    active: false,
    legacyRoutes: [],
    prefix: '',
};
vi.mock('@salesforce/storefront-next-runtime/config', async (orig) => {
    const actual = await orig<typeof import('@salesforce/storefront-next-runtime/config')>();
    return {
        ...actual,
        useConfig: <T extends Record<string, unknown>>() =>
            hybridConfigRef.active
                ? ({
                      url: { prefix: hybridConfigRef.prefix },
                      hybrid: { enabled: true, legacyRoutes: hybridConfigRef.legacyRoutes },
                  } as unknown as T)
                : actual.useConfig<T>(),
    };
});

describe('Link hybrid legacy-route handoff', () => {
    afterEach(async () => {
        cleanup();
        hybridConfigRef.active = false;
        hybridConfigRef.legacyRoutes = [];
        hybridConfigRef.prefix = '';
        await i18next.changeLanguage('en-GB');
    });

    /**
     * Dispatch a primary-button click and report whether React Router intercepted it. RR calls
     * `preventDefault()` only when it handles the navigation client-side; with `reloadDocument` it
     * lets the browser perform a real document load (no preventDefault). This is the behavioral
     * signal that the legacy handoff bypasses client-side routing — the actual Safari fix.
     */
    function clickIsClientIntercepted(el: Element): boolean {
        const ev = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
        el.dispatchEvent(ev);
        return ev.defaultPrevented;
    }

    test('legacy route renders a crawlable href and forces a full document navigation', () => {
        hybridConfigRef.active = true;
        hybridConfigRef.legacyRoutes = ['/'];
        const { getByRole } = renderWithRouter(<Link to="/">Home</Link>);
        const link = getByRole('link');
        // SEO: a real, non-empty, crawlable href — never '#' or missing.
        expect(link).toHaveAttribute('href', '/');
        // Perf/correctness: the click is NOT intercepted → browser does a full document load, so
        // React Router never starts a client nav and never races its failed-chunk reload (Safari).
        expect(clickIsClientIntercepted(link)).toBe(false);
    });

    test('legacy route with a suffix appends it to the bare path (no site prefix doubling)', () => {
        hybridConfigRef.active = true;
        hybridConfigRef.legacyRoutes = [{ pattern: '/product/:id', suffix: '.html' }];
        const { getByRole } = renderWithRouter(<Link to="/product/123">P</Link>);
        const link = getByRole('link');
        expect(link).toHaveAttribute('href', '/product/123.html');
        expect(clickIsClientIntercepted(link)).toBe(false);
    });

    test('non-legacy route in hybrid mode stays client-side (click intercepted)', () => {
        hybridConfigRef.active = true;
        hybridConfigRef.legacyRoutes = ['/cart'];
        const { getByRole } = renderWithRouter(<Link to="/account">Account</Link>);
        // Not a legacy route → React Router keeps handling it client-side (preventDefault).
        expect(clickIsClientIntercepted(getByRole('link'))).toBe(true);
    });

    test('legacy PDP under the default multi-segment url.prefix forces a full document navigation', () => {
        // Regression guard: a `<Link to>` is the BARE functional path, but the default
        // url.prefix '/:siteId/:localeId' has two wildcard segments. The Link must NOT strip the
        // prefix off the bare path (that would consume '/product/123' itself → '/' and collapse
        // every multi-segment link onto a '/' legacy route). Earlier tests only ran with prefix=''
        // (a strip no-op), which hid this.
        hybridConfigRef.active = true;
        hybridConfigRef.prefix = '/:siteId/:localeId';
        hybridConfigRef.legacyRoutes = [{ pattern: '/product/:id', suffix: '.html' }];
        const { getByRole } = renderWithRouter(<Link to="/product/123">P</Link>);
        const link = getByRole('link');
        expect(link).toHaveAttribute('href', '/product/123.html');
        expect(clickIsClientIntercepted(link)).toBe(false);
    });

    test('multi-segment non-legacy route under the default prefix stays client-side (not collapsed to "/")', () => {
        // Locks out the false positive: with '/' as a legacy route and the wildcard prefix, a
        // multi-segment link must NOT resolve to '/' and full-nav to legacy — it stays SFNext.
        hybridConfigRef.active = true;
        hybridConfigRef.prefix = '/:siteId/:localeId';
        hybridConfigRef.legacyRoutes = ['/'];
        const { getByRole } = renderWithRouter(<Link to="/account/orders">Orders</Link>);
        expect(clickIsClientIntercepted(getByRole('link'))).toBe(true);
    });

    test('appends the suffix to the path, before an inline query string and hash', () => {
        // A string `to` carrying a query/hash must get the suffix on the PATH, not after the query
        // (would be `/product/123?color=red.html`). The query/hash are split off, suffix applied,
        // then re-joined.
        hybridConfigRef.active = true;
        hybridConfigRef.legacyRoutes = [{ pattern: '/product/:id', suffix: '.html' }];
        const { getByRole } = renderWithRouter(<Link to="/product/123?color=red#reviews">P</Link>);
        expect(getByRole('link')).toHaveAttribute('href', '/product/123.html?color=red#reviews');
    });
});

describe('NavLink', () => {
    afterEach(async () => {
        cleanup();
        await i18next.changeLanguage('en-GB');
    });

    test('renders a site context prefixed URL', () => {
        const { getByRole } = renderWithRouter(<NavLink to="/product/123">Product</NavLink>);

        expect(getByRole('link')).toHaveAttribute('href', '/global/en-GB/product/123');
    });

    test('passes through an object `to` prop without transformation', () => {
        const { getByRole } = renderWithRouter(
            <NavLink to={{ pathname: '/product/123', search: '?color=red' }}>Product</NavLink>
        );

        expect(getByRole('link')).toHaveAttribute('href', '/product/123?color=red');
    });

    test('forwards a ref to the anchor element', () => {
        const ref = createRef<HTMLAnchorElement>();
        renderWithRouter(
            <NavLink to="/test" ref={ref}>
                Test
            </NavLink>
        );

        expect(ref.current).toBeInstanceOf(HTMLAnchorElement);
    });

    test('uses the current i18n language for locale segment', async () => {
        await i18next.changeLanguage('it-IT');

        const { getByRole } = renderWithRouter(<NavLink to="/product/123">Product</NavLink>);

        expect(getByRole('link')).toHaveAttribute('href', '/global/it-IT/product/123');
    });

    test('passes additional props to the rendered anchor', () => {
        const { getByRole } = renderWithRouter(
            <NavLink to="/test" className="my-navlink" data-testid="custom">
                Test
            </NavLink>
        );

        const link = getByRole('link');
        expect(link).toHaveClass('my-navlink');
        expect(link).toHaveAttribute('data-testid', 'custom');
    });

    test('prefixes root path "/" with site context', () => {
        const { getByRole } = renderWithRouter(<NavLink to="/">Home</NavLink>);

        expect(getByRole('link')).toHaveAttribute('href', '/global/en-GB/');
    });
});
