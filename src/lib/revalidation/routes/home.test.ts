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
import { createMemoryRouter, redirect, type ShouldRevalidateFunctionArgs } from 'react-router';
import { resourceRoutes, routes } from '@/route-paths';
import { shouldRevalidate } from './home';

/**
 * Builds a full {@link ShouldRevalidateFunctionArgs} so each case states only the fields it cares about.
 * Defaults model a same-URL re-render with React Router's default revalidation enabled — the baseline the
 * home route must override to `false`.
 */
function buildArgs(overrides: Partial<ShouldRevalidateFunctionArgs> = {}): ShouldRevalidateFunctionArgs {
    return {
        currentUrl: new URL('http://localhost/'),
        nextUrl: new URL('http://localhost/'),
        currentParams: {},
        nextParams: {},
        defaultShouldRevalidate: true,
        ...overrides,
    } as ShouldRevalidateFunctionArgs;
}

describe('home shouldRevalidate', () => {
    test('opts out on a plain same-URL re-render', () => {
        expect(shouldRevalidate(buildArgs())).toBe(false);
    });

    test('opts out even when React Router defaults to revalidating', () => {
        expect(shouldRevalidate(buildArgs({ defaultShouldRevalidate: true }))).toBe(false);
    });

    test('opts out when React Router already defaults to not revalidating', () => {
        expect(shouldRevalidate(buildArgs({ defaultShouldRevalidate: false }))).toBe(false);
    });

    test('opts out on navigation to a different path', () => {
        expect(
            shouldRevalidate(
                buildArgs({
                    currentUrl: new URL('http://localhost/category/root'),
                    nextUrl: new URL('http://localhost/'),
                })
            )
        ).toBe(false);
    });

    test('opts out when only search params change (URL-driven filtering)', () => {
        expect(
            shouldRevalidate(
                buildArgs({
                    currentUrl: new URL('http://localhost/'),
                    nextUrl: new URL('http://localhost/?sort=price'),
                })
            )
        ).toBe(false);
    });

    test('opts out when route params change', () => {
        expect(
            shouldRevalidate(
                buildArgs({
                    currentParams: { locale: 'en-US' },
                    nextParams: { locale: 'fr-FR' },
                })
            )
        ).toBe(false);
    });

    // The motivating case: a non-navigating mutation (e.g. add-to-cart from the quick view modal) posts to a
    // resource route on the same URL. Without the opt-out this re-runs the home loader's four fetches for no
    // observable change. Assert the full cross-product of every action/resource endpoint the storefront exposes
    // (the central resourceRoutes registry) against every form method — a new entry there is automatically
    // covered, with no single route or method cherry-picked. The exceptions are the loader-relevant mutations
    // (set-site-context, update-shopper-context), which genuinely change the loader's SCAPI output and are
    // asserted separately below.
    const FORM_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
    const LOADER_RELEVANT: string[] = [resourceRoutes.setSiteContext, resourceRoutes.updateShopperContext];
    const resourceRouteMethodCombos = Object.entries(resourceRoutes)
        .filter(([, formAction]) => !LOADER_RELEVANT.includes(formAction))
        .flatMap(([name, formAction]) => FORM_METHODS.map((formMethod) => [formMethod, name, formAction] as const));

    test.each(resourceRouteMethodCombos)('opts out on a %s submission to %s (%s)', (formMethod, _name, formAction) => {
        expect(shouldRevalidate(buildArgs({ formMethod, formAction }))).toBe(false);
    });

    test('opts out even when the action returned a fresh basket payload', () => {
        expect(
            shouldRevalidate(
                buildArgs({
                    formMethod: 'POST',
                    formAction: resourceRoutes.cartItemAdd,
                    actionResult: { success: true, basket: { basketId: 'abc123' } },
                })
            )
        ).toBe(false);
    });

    test('opts out when the triggering action failed', () => {
        expect(
            shouldRevalidate(
                buildArgs({
                    formMethod: 'POST',
                    formAction: resourceRoutes.cartItemAdd,
                    actionResult: { error: 'boom' },
                })
            )
        ).toBe(false);
    });

    describe('currency switch (set-site-context) is allowed through', () => {
        // A currency switch submits set-site-context via a fetcher and returns data (no redirect), so only loader
        // revalidation refreshes the featured-products carousel's per-currency SCAPI prices. Site/locale switches
        // use the same action but hard-reload, bypassing shouldRevalidate, so they need no carve-out here.
        test('revalidates on a POST to set-site-context', () => {
            expect(shouldRevalidate(buildArgs({ formMethod: 'POST', formAction: resourceRoutes.setSiteContext }))).toBe(
                true
            );
        });

        test('revalidates even when set-site-context is submitted as an absolute URL with a query string', () => {
            expect(
                shouldRevalidate(
                    buildArgs({
                        formMethod: 'POST',
                        formAction: `http://localhost${resourceRoutes.setSiteContext}?index`,
                    })
                )
            ).toBe(true);
        });

        test('does NOT revalidate on a GET to set-site-context (only mutations are allowed through)', () => {
            expect(shouldRevalidate(buildArgs({ formMethod: 'GET', formAction: resourceRoutes.setSiteContext }))).toBe(
                false
            );
        });
    });

    describe('shopper context update (update-shopper-context) is allowed through', () => {
        // Shopper context is a cross-cutting input to every SCAPI response (promotions, pricing, A/B segments), so a
        // non-navigating update changes the home loader's featured-products carousel output. The update hook submits a
        // PUT fetcher that returns data (no redirect), so only loader revalidation reflects the new context.
        test('revalidates on a PUT to update-shopper-context', () => {
            expect(
                shouldRevalidate(buildArgs({ formMethod: 'PUT', formAction: resourceRoutes.updateShopperContext }))
            ).toBe(true);
        });

        test('revalidates even when update-shopper-context is submitted as an absolute URL with a query string', () => {
            expect(
                shouldRevalidate(
                    buildArgs({
                        formMethod: 'PUT',
                        formAction: `http://localhost${resourceRoutes.updateShopperContext}?index`,
                    })
                )
            ).toBe(true);
        });

        test('does NOT revalidate on a GET to update-shopper-context (only mutations are allowed through)', () => {
            expect(
                shouldRevalidate(buildArgs({ formMethod: 'GET', formAction: resourceRoutes.updateShopperContext }))
            ).toBe(false);
        });
    });

    describe('auth identity transitions are allowed through', () => {
        // The home loader's SCAPI reads are customer-group-scoped (pricing / promotions). An identity transition
        // (login / signup / logout) submitted while already on the home page can redirect back to '/', keeping the
        // home route matched — so shouldRevalidate decides whether those reads refresh for the now-registered /
        // now-guest session. Unlike the /action/* routes, the identity form actions are site/locale-prefixed (buildUrl prefixes
        // them; they are not in url.excludeRoutes), so the match is on the trailing path segment, not an exact-string
        // compare.
        test('revalidates on a POST to the unprefixed logout path', () => {
            expect(shouldRevalidate(buildArgs({ formMethod: 'POST', formAction: routes.logout }))).toBe(true);
        });

        test('revalidates on a POST to the site/locale-prefixed logout path', () => {
            expect(shouldRevalidate(buildArgs({ formMethod: 'POST', formAction: '/RefArchGlobal/en-US/logout' }))).toBe(
                true
            );
        });

        test('revalidates even when logout is submitted as an absolute URL with a query string', () => {
            expect(
                shouldRevalidate(
                    buildArgs({ formMethod: 'POST', formAction: 'http://localhost/RefArchGlobal/en-US/logout?index' })
                )
            ).toBe(true);
        });

        test('revalidates on a POST to the unprefixed login path', () => {
            expect(shouldRevalidate(buildArgs({ formMethod: 'POST', formAction: routes.login }))).toBe(true);
        });

        test('revalidates on a POST to the site/locale-prefixed login path', () => {
            expect(shouldRevalidate(buildArgs({ formMethod: 'POST', formAction: '/RefArchGlobal/en-US/login' }))).toBe(
                true
            );
        });

        test('revalidates on a POST to the unprefixed signup path', () => {
            expect(shouldRevalidate(buildArgs({ formMethod: 'POST', formAction: routes.signup }))).toBe(true);
        });

        test('revalidates on a POST to the site/locale-prefixed signup path', () => {
            expect(shouldRevalidate(buildArgs({ formMethod: 'POST', formAction: '/RefArchGlobal/en-US/signup' }))).toBe(
                true
            );
        });

        test('does NOT revalidate on a path that merely ends in the logout segment as a substring', () => {
            // Guard against a loose substring match: a route like /account/auto-logout must not trigger.
            expect(
                shouldRevalidate(buildArgs({ formMethod: 'POST', formAction: '/RefArchGlobal/en-US/auto-logout' }))
            ).toBe(false);
        });

        test('does NOT revalidate on a GET to logout (only mutations are allowed through)', () => {
            expect(shouldRevalidate(buildArgs({ formMethod: 'GET', formAction: routes.logout }))).toBe(false);
        });

        test('does NOT revalidate on a GET to login (only mutations are allowed through)', () => {
            expect(shouldRevalidate(buildArgs({ formMethod: 'GET', formAction: routes.login }))).toBe(false);
        });
    });
});

// End-to-end: drive a real React Router instance through the actual logout-on-home flow so the
// gate is exercised the way the framework calls it — not just via hand-built args. Proves that
// returning true for /logout makes the home loader re-run along the real redirect chain
// (/{site}/{locale}/logout -> '/' -> /{site}/{locale}/), while an add-to-cart still does not.
describe('home shouldRevalidate — integration with React Router', () => {
    function buildRouter(homeLoader: () => unknown) {
        return createMemoryRouter(
            [
                {
                    // Bare '/' redirects to the prefixed home, like the real home loader does.
                    path: '/',
                    loader: () => redirect('/RefArchGlobal/en-US/'),
                },
                {
                    path: '/:siteId/:localeId',
                    id: 'home',
                    loader: homeLoader,
                    shouldRevalidate,
                    Component: () => null,
                },
                {
                    // buildUrl prefixes /logout, so the action lives under the prefix too.
                    path: '/:siteId/:localeId/logout',
                    action: () => redirect('/'),
                },
                {
                    // An unprefixed resource action, like the real add-to-cart.
                    path: resourceRoutes.cartItemAdd,
                    action: () => ({ success: true, basket: { basketId: 'abc' } }),
                },
            ],
            { initialEntries: ['/RefArchGlobal/en-US/'] }
        );
    }

    test('logout submitted while on home re-runs the home loader', async () => {
        const homeLoader = vi.fn(() => ({ ok: true }));
        const router = buildRouter(homeLoader);

        await router.navigate('/RefArchGlobal/en-US/');
        const before = homeLoader.mock.calls.length;

        await router.navigate('/RefArchGlobal/en-US/logout', { formMethod: 'post', formData: new FormData() });

        expect(router.state.location.pathname).toBe('/RefArchGlobal/en-US/');
        expect(homeLoader.mock.calls.length).toBe(before + 1);
    });

    test('add-to-cart submitted while on home does NOT re-run the home loader', async () => {
        const homeLoader = vi.fn(() => ({ ok: true }));
        const router = buildRouter(homeLoader);

        await router.navigate('/RefArchGlobal/en-US/');
        const before = homeLoader.mock.calls.length;

        await router.navigate(resourceRoutes.cartItemAdd, { formMethod: 'post', formData: new FormData() });

        expect(homeLoader.mock.calls.length).toBe(before);
    });
});
