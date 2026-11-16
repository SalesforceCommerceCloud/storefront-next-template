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
import { shouldRevalidate as productShouldRevalidate } from './product';
import { resourceRoutes } from '@/route-paths';

/** Builds a full ShouldRevalidateFunctionArgs with sensible defaults, overridable per test. */
function buildArgs(overrides: Partial<ShouldRevalidateFunctionArgs>): ShouldRevalidateFunctionArgs {
    return {
        currentUrl: new URL('http://localhost/product/product-1'),
        nextUrl: new URL('http://localhost/product/product-1'),
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

describe('productShouldRevalidate', () => {
    describe('action axis — mutations outside the product-relevant set are skipped by default', () => {
        // Suppress-by-default: any mutation not proven to feed the loader is skipped. These cart / wishlist /
        // account / pre-auth writes touch only basket, customer, or session data the PDP loader never reads
        // so they must not trigger the expensive fan-out.
        test.each([
            resourceRoutes.cartItemAdd,
            resourceRoutes.cartItemRemove,
            resourceRoutes.cartItemUpdate,
            resourceRoutes.cartBundleAdd,
            resourceRoutes.cartBundleUpdate,
            resourceRoutes.cartSetAdd,
            resourceRoutes.bonusProductAdd,
            resourceRoutes.promoCodeAdd,
            resourceRoutes.promoCodeRemove,
            resourceRoutes.wishlistAdd,
            resourceRoutes.wishlistRemove,
            resourceRoutes.updateMarketingConsent,
            resourceRoutes.paymentMethodAdd,
            resourceRoutes.paymentMethodRemove,
            resourceRoutes.paymentMethodSetDefault,
            resourceRoutes.customerPreferencesUpdate,
            resourceRoutes.requestPasswordReset,
            resourceRoutes.otpRequest,
            resourceRoutes.otpVerify,
        ])('skips revalidation after %s', (formAction) => {
            expect(productShouldRevalidate(buildArgs({ formMethod: 'POST', formAction }))).toBe(false);
        });

        test('skips updateTrackingConsent (coupling unsettled; PDP loader reads no consent-gated field)', () => {
            expect(
                productShouldRevalidate(
                    buildArgs({ formMethod: 'POST', formAction: resourceRoutes.updateTrackingConsent })
                )
            ).toBe(false);
        });

        test('skips a mutation with no formAction (a product-relevant write posts to a dedicated action route)', () => {
            expect(productShouldRevalidate(buildArgs({ formMethod: 'POST', formAction: undefined }))).toBe(false);
        });
    });

    describe('action axis — mutations that feed the loader revalidate', () => {
        test.each([
            resourceRoutes.verifyPasswordlessOtp,
            resourceRoutes.passkeyFinishAuthentication,
        ])('refreshes registered product qualification after %s', (formAction) => {
            expect(productShouldRevalidate(buildArgs({ formMethod: 'POST', formAction }))).toBe(true);
        });

        test('resolves a product-relevant action even when formAction is absolute with a query string', () => {
            expect(
                productShouldRevalidate(
                    buildArgs({
                        formMethod: 'POST',
                        formAction: `http://localhost${resourceRoutes.addReview}?foo=bar`,
                    })
                )
            ).toBe(true);
        });

        test('revalidates after add-review (changes the reviews the loader reads)', () => {
            expect(
                productShouldRevalidate(buildArgs({ formMethod: 'POST', formAction: resourceRoutes.addReview }))
            ).toBe(true);
        });

        test('revalidates after a store change (drives availability/inventory)', () => {
            expect(
                productShouldRevalidate(buildArgs({ formMethod: 'POST', formAction: resourceRoutes.setSelectedStore }))
            ).toBe(true);
        });

        test('revalidates after a pickup-store update (drives availability)', () => {
            expect(
                productShouldRevalidate(
                    buildArgs({ formMethod: 'POST', formAction: resourceRoutes.cartPickupStoreUpdate })
                )
            ).toBe(true);
        });

        test('revalidates after a currency (set-site-context) submission (prices change)', () => {
            expect(
                productShouldRevalidate(buildArgs({ formMethod: 'POST', formAction: resourceRoutes.setSiteContext }))
            ).toBe(true);
        });

        test('revalidates after a shopper-context update (cross-cutting pricing/promotions input)', () => {
            expect(
                productShouldRevalidate(
                    buildArgs({ formMethod: 'POST', formAction: resourceRoutes.updateShopperContext })
                )
            ).toBe(true);
        });

        test('forces revalidation for a product-relevant mutation even when defaultShouldRevalidate is false', () => {
            // Pins the action axis returning `true` unconditionally, not deferring to the default (see product.ts).
            expect(
                productShouldRevalidate(
                    buildArgs({
                        formMethod: 'POST',
                        formAction: resourceRoutes.addReview,
                        defaultShouldRevalidate: false,
                    })
                )
            ).toBe(true);
        });

        test('defers a GET to the navigation axis instead of the action axis', () => {
            // Only non-GET submissions are gated on the action axis; a GET targeting a product-relevant path
            // must still fall through to the navigation axis (same path here → skip).
            expect(
                productShouldRevalidate(
                    buildArgs({
                        formMethod: 'GET',
                        formAction: resourceRoutes.addReview,
                        defaultShouldRevalidate: false,
                    })
                )
            ).toBe(false);
        });
    });

    describe('navigation axis — original product/variant behavior is preserved', () => {
        test('revalidates when the pathname changes (different product)', () => {
            expect(
                productShouldRevalidate(
                    buildArgs({
                        currentUrl: new URL('http://localhost/product/product-1'),
                        nextUrl: new URL('http://localhost/product/product-2'),
                        defaultShouldRevalidate: false,
                    })
                )
            ).toBe(true);
        });

        test('revalidates when the pid (variant) changes', () => {
            expect(
                productShouldRevalidate(
                    buildArgs({
                        currentUrl: new URL('http://localhost/product/product-1?pid=variant-1'),
                        nextUrl: new URL('http://localhost/product/product-1?pid=variant-2'),
                        defaultShouldRevalidate: false,
                    })
                )
            ).toBe(true);
        });

        test('does NOT revalidate for client-only param changes (color/size)', () => {
            expect(
                productShouldRevalidate(
                    buildArgs({
                        currentUrl: new URL('http://localhost/product/product-1?color=red&size=large'),
                        nextUrl: new URL('http://localhost/product/product-1?color=blue&size=medium'),
                        defaultShouldRevalidate: false,
                    })
                )
            ).toBe(false);
        });

        test('honors an explicit revalidate() (defaultShouldRevalidate true, e.g. a store change)', () => {
            expect(
                productShouldRevalidate(
                    buildArgs({
                        currentUrl: new URL('http://localhost/product/product-1?color=red'),
                        nextUrl: new URL('http://localhost/product/product-1?color=red'),
                        defaultShouldRevalidate: true,
                    })
                )
            ).toBe(true);
        });
    });
});
