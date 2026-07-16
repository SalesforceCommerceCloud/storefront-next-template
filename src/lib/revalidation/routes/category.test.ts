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
import { describe, expect, test } from 'vitest';
import type { ShouldRevalidateFunctionArgs } from 'react-router';
import { shouldRevalidate } from './category';
import { resourceRoutes, routes } from '@/route-paths';

/** Builds a full ShouldRevalidateFunctionArgs with sensible defaults, overridable per test. */
function buildArgs(overrides: Partial<ShouldRevalidateFunctionArgs>): ShouldRevalidateFunctionArgs {
    return {
        currentUrl: new URL('http://localhost/category/mens'),
        nextUrl: new URL('http://localhost/category/mens'),
        currentParams: {},
        nextParams: {},
        defaultShouldRevalidate: true,
        formMethod: undefined,
        formAction: undefined,
        formEncType: undefined,
        formData: undefined,
        json: undefined,
        text: undefined,
        actionStatus: undefined,
        actionResult: undefined,
        ...overrides,
    } as ShouldRevalidateFunctionArgs;
}

/**
 * Both listing routes share this policy (`_app.search.tsx` re-exports `shouldRevalidate` from `./category`), so every
 * case runs against both. `listing` is the route's stable URL (carrying its identifying param — category id or `q`),
 * `otherListing` a different listing on the same route for cross-navigation cases.
 */
const LISTINGS = [
    {
        name: 'category',
        listing: 'http://localhost/category/mens?refine=cgid=mens',
        otherListing: 'http://localhost/category/womens?refine=cgid=womens',
    },
    {
        name: 'search',
        listing: 'http://localhost/search?q=shirt',
        otherListing: 'http://localhost/search?q=shoes',
    },
] as const;

describe.each(LISTINGS)('$name shouldRevalidate', ({ listing, otherListing }) => {
    /** buildArgs with current/next defaulted to this route's listing URL (overridable per test). */
    const args = (overrides: Partial<ShouldRevalidateFunctionArgs> = {}): ShouldRevalidateFunctionArgs =>
        buildArgs({ currentUrl: new URL(listing), nextUrl: new URL(listing), ...overrides });

    describe('client-only param toggles', () => {
        test('skips when only the filters panel flag changes', () => {
            expect(
                shouldRevalidate(
                    args({
                        currentUrl: new URL(`${listing}&filters=closed`),
                        nextUrl: new URL(`${listing}&filters=open`),
                    })
                )
            ).toBe(false);
        });

        test('skips when only pending-action params change', () => {
            expect(
                shouldRevalidate(
                    args({
                        currentUrl: new URL(listing),
                        nextUrl: new URL(`${listing}&action=addToWishlist&actionParams=%7B%7D`),
                    })
                )
            ).toBe(false);
        });
    });

    describe('genuine navigations (no submission)', () => {
        test('revalidates when a refinement changes', () => {
            expect(
                shouldRevalidate(
                    args({
                        currentUrl: new URL(listing),
                        nextUrl: new URL(`${listing}&refine=c_color=blue`),
                    })
                )
            ).toBe(true);
        });

        test('revalidates when the sort order changes', () => {
            expect(
                shouldRevalidate(
                    args({
                        currentUrl: new URL(`${listing}&sort=best-matches`),
                        nextUrl: new URL(`${listing}&sort=price-low-to-high`),
                    })
                )
            ).toBe(true);
        });

        test('revalidates when paging (offset changes)', () => {
            expect(
                shouldRevalidate(
                    args({
                        currentUrl: new URL(listing),
                        nextUrl: new URL(`${listing}&offset=24`),
                    })
                )
            ).toBe(true);
        });

        test('defers to defaultShouldRevalidate=false (e.g. cross-route navigation)', () => {
            expect(
                shouldRevalidate(
                    args({
                        currentUrl: new URL(listing),
                        nextUrl: new URL(otherListing),
                        defaultShouldRevalidate: false,
                    })
                )
            ).toBe(false);
        });
    });

    describe('mutations submitted from the listing', () => {
        test('skips revalidation after add-to-cart', () => {
            expect(
                shouldRevalidate(
                    args({
                        formMethod: 'POST',
                        formAction: resourceRoutes.cartItemAdd,
                    })
                )
            ).toBe(false);
        });

        test('skips revalidation after a wishlist toggle', () => {
            expect(
                shouldRevalidate(
                    args({
                        formMethod: 'POST',
                        formAction: resourceRoutes.wishlistAdd,
                    })
                )
            ).toBe(false);
        });

        test('revalidates after a currency (set-site-context) submission', () => {
            expect(
                shouldRevalidate(
                    args({
                        formMethod: 'POST',
                        formAction: resourceRoutes.setSiteContext,
                    })
                )
            ).toBe(true);
        });

        test('revalidates after a shopper-context (update-shopper-context) submission', () => {
            expect(
                shouldRevalidate(
                    args({
                        formMethod: 'POST',
                        formAction: resourceRoutes.updateShopperContext,
                    })
                )
            ).toBe(true);
        });

        test('defers an allowlisted mutation to defaultShouldRevalidate=false', () => {
            expect(
                shouldRevalidate(
                    args({
                        formMethod: 'POST',
                        formAction: resourceRoutes.setSiteContext,
                        defaultShouldRevalidate: false,
                    })
                )
            ).toBe(false);
        });

        test('treats a GET submission as a navigation, not a mutation (falls through to default)', () => {
            expect(
                shouldRevalidate(
                    args({
                        currentUrl: new URL(listing),
                        nextUrl: new URL(otherListing),
                        formMethod: 'GET',
                        formAction: resourceRoutes.cartItemAdd,
                    })
                )
            ).toBe(true);
        });

        test('matches the allowlisted action even when formAction is absolute with a query string', () => {
            expect(
                shouldRevalidate(
                    args({
                        formMethod: 'POST',
                        formAction: `http://localhost${resourceRoutes.setSiteContext}?foo=bar`,
                    })
                )
            ).toBe(true);
        });

        test('skips when a mutation has no formAction (defensive: cannot confirm it is allowlisted)', () => {
            expect(
                shouldRevalidate(
                    args({
                        formMethod: 'POST',
                        formAction: undefined,
                    })
                )
            ).toBe(false);
        });
    });

    // An identity transition re-scopes the loader's customer-group-scoped SCAPI reads (pricing / promotions).
    // If an in-place auth submission (e.g. a useFetcher LoginModal) ever keeps a listing route mounted across the
    // mutation, this gate must re-run the loader to refresh them for the now-registered/now-guest session. The identity
    // routes are site/locale-prefixed, so they are matched on the trailing segment, unlike the unprefixed /action/* routes.
    describe('auth identity transitions are allowed through', () => {
        test('revalidates after a logout submitted on the listing', () => {
            expect(shouldRevalidate(args({ formMethod: 'POST', formAction: '/RefArchGlobal/en-US/logout' }))).toBe(
                true
            );
        });

        test('revalidates after a login submitted on the listing', () => {
            expect(shouldRevalidate(args({ formMethod: 'POST', formAction: '/RefArchGlobal/en-US/login' }))).toBe(true);
        });

        test('revalidates after a signup submitted on the listing', () => {
            expect(shouldRevalidate(args({ formMethod: 'POST', formAction: routes.signup }))).toBe(true);
        });

        test('does NOT revalidate on a path that merely ends in an identity segment as a substring', () => {
            expect(shouldRevalidate(args({ formMethod: 'POST', formAction: '/RefArchGlobal/en-US/auto-logout' }))).toBe(
                false
            );
        });
    });
});
