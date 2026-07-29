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
import { shouldRevalidate as rootShouldRevalidate } from './root';
import { resourceRoutes, routes } from '@/route-paths';
import { CHECKOUT_ACTION_INTENTS } from '@/components/checkout/utils/checkout-context-types';

/** Build a FormData with `intent` set to the given string. Used by checkout-step submission tests. */
function formDataWithIntent(intent: string): FormData {
    const fd = new FormData();
    fd.set('intent', intent);
    return fd;
}

/** Builds a full ShouldRevalidateFunctionArgs with sensible defaults, overridable per test. */
function buildArgs(overrides: Partial<ShouldRevalidateFunctionArgs>): ShouldRevalidateFunctionArgs {
    return {
        currentUrl: new URL('http://localhost/'),
        nextUrl: new URL('http://localhost/'),
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

describe('rootShouldRevalidate', () => {
    describe('listing-/auth-irrelevant mutations are skipped', () => {
        // Every denylisted action, paired with the HTTP method it is actually submitted with in the app, so the
        // table mirrors production rather than assuming POST. cart-item-update and cart-bundle-update use PATCH
        // (see use-cart-quantity-update.ts / use-product-actions.ts); everything else POSTs.
        const skippedMutations: ReadonlyArray<{ label: string; formMethod: 'POST' | 'PATCH'; formAction: string }> = [
            { label: 'add-to-cart', formMethod: 'POST', formAction: resourceRoutes.cartItemAdd },
            { label: 'a cart-item remove', formMethod: 'POST', formAction: resourceRoutes.cartItemRemove },
            { label: 'a cart-item update', formMethod: 'PATCH', formAction: resourceRoutes.cartItemUpdate },
            { label: 'a cart-bundle add', formMethod: 'POST', formAction: resourceRoutes.cartBundleAdd },
            { label: 'a cart-bundle update', formMethod: 'PATCH', formAction: resourceRoutes.cartBundleUpdate },
            { label: 'a cart-set add', formMethod: 'POST', formAction: resourceRoutes.cartSetAdd },
            { label: 'a bonus-product add', formMethod: 'POST', formAction: resourceRoutes.bonusProductAdd },
            { label: 'a promo-code add', formMethod: 'POST', formAction: resourceRoutes.promoCodeAdd },
            { label: 'a promo-code remove', formMethod: 'POST', formAction: resourceRoutes.promoCodeRemove },
            { label: 'a wishlist add', formMethod: 'POST', formAction: resourceRoutes.wishlistAdd },
            { label: 'a wishlist remove', formMethod: 'POST', formAction: resourceRoutes.wishlistRemove },
            {
                label: 'a marketing-consent update',
                formMethod: 'POST',
                formAction: resourceRoutes.updateMarketingConsent,
            },
            { label: 'a payment-method add', formMethod: 'POST', formAction: resourceRoutes.paymentMethodAdd },
            { label: 'a payment-method remove', formMethod: 'POST', formAction: resourceRoutes.paymentMethodRemove },
            {
                label: 'a payment-method set-default',
                formMethod: 'POST',
                formAction: resourceRoutes.paymentMethodSetDefault,
            },
            { label: 'a password-reset request', formMethod: 'POST', formAction: resourceRoutes.requestPasswordReset },
            { label: 'an OTP request', formMethod: 'POST', formAction: resourceRoutes.otpRequest },
            // otp-verify validates an email without issuing a session, so it never touches clientAuth.
            { label: 'an OTP verify (issues no session)', formMethod: 'POST', formAction: resourceRoutes.otpVerify },
            {
                label: 'a customer-preferences update',
                formMethod: 'PATCH',
                formAction: resourceRoutes.customerPreferencesUpdate,
            },
            { label: 'a pickup-store update', formMethod: 'PATCH', formAction: resourceRoutes.cartPickupStoreUpdate },
            { label: 'a review submission', formMethod: 'POST', formAction: resourceRoutes.addReview },
        ];

        test.each(skippedMutations)('skips revalidation after $label', ({ formMethod, formAction }) => {
            expect(rootShouldRevalidate(buildArgs({ formMethod, formAction }))).toBe(false);
        });

        // Drift guard, tested through behavior rather than the internal denylist (which stays unexported). Every
        // resource route the storefront exposes is classified by the policy as either skipped or revalidating; this
        // asserts the set the policy actually skips matches the set this table claims to skip. A new denylist entry
        // that isn't given a row here flips its route from "expected revalidate" to "actually skipped" and fails.
        test('the skipped-mutation table matches every route the policy actually skips', () => {
            const expectedSkipped = new Set(skippedMutations.map((m) => m.formAction));
            const actuallySkipped = Object.values(resourceRoutes).filter(
                (formAction) => rootShouldRevalidate(buildArgs({ formMethod: 'POST', formAction })) === false
            );
            expect(new Set(actuallySkipped)).toEqual(expectedSkipped);
        });

        test('matches a denylisted action even when formAction is absolute with a query string', () => {
            expect(
                rootShouldRevalidate(
                    buildArgs({
                        formMethod: 'POST',
                        formAction: `http://localhost${resourceRoutes.cartItemAdd}?foo=bar`,
                    })
                )
            ).toBe(false);
        });
    });

    describe('auth-/currency-relevant mutations still revalidate', () => {
        test('revalidates after a currency (set-site-context) submission', () => {
            expect(
                rootShouldRevalidate(buildArgs({ formMethod: 'POST', formAction: resourceRoutes.setSiteContext }))
            ).toBe(true);
        });

        test('revalidates after a passwordless OTP verify (logs the shopper in)', () => {
            expect(
                rootShouldRevalidate(
                    buildArgs({ formMethod: 'POST', formAction: resourceRoutes.verifyPasswordlessOtp })
                )
            ).toBe(true);
        });

        test('revalidates after a post-order registration (auto-login changes clientAuth)', () => {
            expect(
                rootShouldRevalidate(buildArgs({ formMethod: 'POST', formAction: resourceRoutes.postOrderRegister }))
            ).toBe(true);
        });

        test('revalidates after a tracking-consent update (writes clientAuth.trackingConsent)', () => {
            expect(
                rootShouldRevalidate(
                    buildArgs({ formMethod: 'POST', formAction: resourceRoutes.updateTrackingConsent })
                )
            ).toBe(true);
        });

        test('revalidates after a shopper-context update (cross-cutting SCAPI input, kept on the safe path)', () => {
            expect(
                rootShouldRevalidate(buildArgs({ formMethod: 'POST', formAction: resourceRoutes.updateShopperContext }))
            ).toBe(true);
        });

        test('revalidates after a selected-store change (root returns selectedStoreInfo from that cookie)', () => {
            expect(
                rootShouldRevalidate(buildArgs({ formMethod: 'POST', formAction: resourceRoutes.setSelectedStore }))
            ).toBe(true);
        });

        test('revalidates a mutation with no formAction (cannot confirm it is safe to skip)', () => {
            expect(rootShouldRevalidate(buildArgs({ formMethod: 'POST', formAction: undefined }))).toBe(true);
        });
    });

    describe('non-submission revalidations always defer to the default', () => {
        test('revalidates an explicit useRevalidator() call (no formMethod) — refreshes clientAuth', () => {
            // The checkout login flow and BackNavigationRevalidator both call revalidate() with no
            // submission; they must be able to refresh clientAuth.
            expect(rootShouldRevalidate(buildArgs({ formMethod: undefined }))).toBe(true);
        });

        test('honors defaultShouldRevalidate=false on a plain navigation', () => {
            expect(
                rootShouldRevalidate(
                    buildArgs({
                        currentUrl: new URL('http://localhost/category/mens'),
                        nextUrl: new URL('http://localhost/category/womens'),
                        defaultShouldRevalidate: false,
                    })
                )
            ).toBe(false);
        });

        test('does not skip a GET navigation that happens to target a denylisted path', () => {
            // Only non-GET submissions are candidates for skipping; a GET must never be suppressed here.
            expect(rootShouldRevalidate(buildArgs({ formMethod: 'GET', formAction: resourceRoutes.cartItemAdd }))).toBe(
                true
            );
        });
    });

    describe('checkout step submissions are skipped', () => {
        // Each step intent posts back to /checkout with `intent=<value>`. The action only mutates the basket; root
        // would otherwise revalidate for nothing. Use a site-prefixed checkout path to mirror production traffic.
        const checkoutPath = `/global/en-GB${routes.checkout}`;

        test.each(
            Object.values(CHECKOUT_ACTION_INTENTS)
        )('skips revalidation for intent=%s on the checkout route', (intent) => {
            expect(
                rootShouldRevalidate(
                    buildArgs({
                        formMethod: 'POST',
                        formAction: checkoutPath,
                        formData: formDataWithIntent(intent),
                    })
                )
            ).toBe(false);
        });

        test('revalidates an unknown intent on the checkout route (denylist is intent-specific)', () => {
            expect(
                rootShouldRevalidate(
                    buildArgs({
                        formMethod: 'POST',
                        formAction: checkoutPath,
                        formData: formDataWithIntent('placeOrder'),
                    })
                )
            ).toBe(true);
        });

        test('revalidates a checkout submission with no intent (cannot confirm it is safe to skip)', () => {
            expect(
                rootShouldRevalidate(
                    buildArgs({ formMethod: 'POST', formAction: checkoutPath, formData: new FormData() })
                )
            ).toBe(true);
        });

        test('does not skip a colliding intent on a non-checkout, non-denylisted path', () => {
            // Guard against a future action elsewhere that happens to use the same `intent` string. The intent rule
            // must only fire when the path is the checkout route; an unrelated action with `intent=payment` should
            // fall through to defaultShouldRevalidate.
            expect(
                rootShouldRevalidate(
                    buildArgs({
                        formMethod: 'POST',
                        formAction: '/some/unrelated/action',
                        formData: formDataWithIntent(CHECKOUT_ACTION_INTENTS.PAYMENT),
                    })
                )
            ).toBe(true);
        });
    });
});
