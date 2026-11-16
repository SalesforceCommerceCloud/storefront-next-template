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
import { shouldRevalidate } from './wishlist';

/**
 * Builds a full {@link ShouldRevalidateFunctionArgs} so each case states only the fields it cares about.
 * Defaults model a same-URL re-render with React Router's default revalidation enabled — the baseline both
 * wishlist routes must override to `false`.
 */
function buildArgs(overrides: Partial<ShouldRevalidateFunctionArgs> = {}): ShouldRevalidateFunctionArgs {
    return {
        currentUrl: new URL('http://localhost/wishlist'),
        nextUrl: new URL('http://localhost/wishlist'),
        currentParams: {},
        nextParams: {},
        defaultShouldRevalidate: true,
        ...overrides,
    } as ShouldRevalidateFunctionArgs;
}

describe('wishlist shouldRevalidate', () => {
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
                    nextUrl: new URL('http://localhost/wishlist'),
                })
            )
        ).toBe(false);
    });

    test('opts out when only search params change', () => {
        expect(
            shouldRevalidate(
                buildArgs({
                    currentUrl: new URL('http://localhost/wishlist'),
                    nextUrl: new URL('http://localhost/wishlist?sort=name'),
                })
            )
        ).toBe(false);
    });

    // The motivating case: a non-navigating mutation (e.g. add-to-cart from a wishlist tile, or a wishlist remove)
    // posts to a resource route on the same URL. Without the opt-out this re-runs the wishlist loader's
    // getCustomerProductLists SCAPI read for no observable change. Assert the full cross-product of every action/
    // resource endpoint the storefront exposes against every form method — a new entry is automatically covered.
    // The exceptions are the loader-relevant mutations (set-site-context, update-shopper-context), asserted below.
    const FORM_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
    const LOADER_RELEVANT: string[] = [resourceRoutes.setSiteContext, resourceRoutes.updateShopperContext];
    const AUTH_COMPLETION: string[] = [
        resourceRoutes.verifyPasswordlessOtp,
        resourceRoutes.passkeyFinishAuthentication,
        resourceRoutes.postOrderRegister,
    ];
    test.each(AUTH_COMPLETION)('refreshes identity-dependent data after %s', (formAction) => {
        expect(shouldRevalidate(buildArgs({ formMethod: 'POST', formAction }))).toBe(true);
    });
    const resourceRouteMethodCombos = Object.entries(resourceRoutes)
        .filter(([, formAction]) => !LOADER_RELEVANT.includes(formAction))
        .flatMap(([name, formAction]) => FORM_METHODS.map((formMethod) => [formMethod, name, formAction] as const))
        .filter(([method, , path]) => method === 'GET' || !AUTH_COMPLETION.includes(path));

    test.each(resourceRouteMethodCombos)('opts out on a %s submission to %s (%s)', (formMethod, _name, formAction) => {
        expect(shouldRevalidate(buildArgs({ formMethod, formAction }))).toBe(false);
    });

    test('opts out even when the action returned a fresh wishlist payload', () => {
        expect(
            shouldRevalidate(
                buildArgs({
                    formMethod: 'POST',
                    formAction: resourceRoutes.wishlistRemove,
                    actionResult: { success: true },
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
        // revalidation refreshes the per-currency SCAPI prices on the wishlist tiles.
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
        // Shopper context is a cross-cutting input to every SCAPI response (promotions, pricing, segments), so a
        // non-navigating update changes the wishlist tile prices and any segment-driven content.
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
        // Both wishlist routes are auth-dependent. The loader's getCustomerProductLists read returns the shopper's
        // saved items for a registered session and nothing for a guest, so an identity transition (login / signup /
        // logout) submitted while on either wishlist page needs to re-seed the tile grid for the new identity. The
        // public /wishlist route's loader redirects registered shoppers to /account/wishlist, and /account/wishlist
        // is inside _app.account which redirects unauthenticated shoppers away — both redirects only fire on the
        // next loader run. Identity form actions are site/locale-prefixed (buildUrl prefixes them; they are not in
        // url.excludeRoutes), so the match is on the trailing path segment, not an exact-string compare.
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

// End-to-end: drive a real React Router instance through the actual flows so the gate is exercised the way the
// framework calls it. Proves that returning true for /logout makes the wishlist loader re-run along the real
// redirect chain, while an add-to-cart from a wishlist tile (the motivating case) still does not.
describe('wishlist shouldRevalidate — integration with React Router', () => {
    function buildRouter(wishlistLoader: () => unknown) {
        return createMemoryRouter(
            [
                {
                    path: '/:siteId/:localeId/wishlist',
                    id: 'wishlist',
                    loader: wishlistLoader,
                    shouldRevalidate,
                    Component: () => null,
                },
                {
                    path: '/:siteId/:localeId/logout',
                    action: () => redirect('/RefArchGlobal/en-US/wishlist'),
                },
                {
                    path: resourceRoutes.cartItemAdd,
                    action: () => ({ success: true, basket: { basketId: 'abc' } }),
                },
                {
                    path: resourceRoutes.wishlistRemove,
                    action: () => ({ success: true }),
                },
            ],
            { initialEntries: ['/RefArchGlobal/en-US/wishlist'] }
        );
    }

    test('logout submitted while on the wishlist page re-runs the wishlist loader', async () => {
        const wishlistLoader = vi.fn(() => ({ items: [], productsByProductId: Promise.resolve({}) }));
        const router = buildRouter(wishlistLoader);

        await router.navigate('/RefArchGlobal/en-US/wishlist');
        const before = wishlistLoader.mock.calls.length;

        await router.navigate('/RefArchGlobal/en-US/logout', { formMethod: 'post', formData: new FormData() });

        expect(router.state.location.pathname).toBe('/RefArchGlobal/en-US/wishlist');
        expect(wishlistLoader.mock.calls.length).toBe(before + 1);
    });

    test('add-to-cart from a wishlist tile does NOT re-run the wishlist loader', async () => {
        const wishlistLoader = vi.fn(() => ({ items: [], productsByProductId: Promise.resolve({}) }));
        const router = buildRouter(wishlistLoader);

        await router.navigate('/RefArchGlobal/en-US/wishlist');
        const before = wishlistLoader.mock.calls.length;

        await router.navigate(resourceRoutes.cartItemAdd, { formMethod: 'post', formData: new FormData() });

        expect(wishlistLoader.mock.calls.length).toBe(before);
    });

    test('wishlist remove does NOT re-run the wishlist loader', async () => {
        const wishlistLoader = vi.fn(() => ({ items: [], productsByProductId: Promise.resolve({}) }));
        const router = buildRouter(wishlistLoader);

        await router.navigate('/RefArchGlobal/en-US/wishlist');
        const before = wishlistLoader.mock.calls.length;

        await router.navigate(resourceRoutes.wishlistRemove, { formMethod: 'post', formData: new FormData() });

        expect(wishlistLoader.mock.calls.length).toBe(before);
    });
});
