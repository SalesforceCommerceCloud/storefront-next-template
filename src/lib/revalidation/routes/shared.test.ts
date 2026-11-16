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
import { resourceRoutes, routes } from '@/route-paths';
import { getActionPath, isAmbientMutation, isContextMutation, isIdentityMutation } from './shared';

describe('getActionPath', () => {
    test('returns undefined when formAction is absent', () => {
        expect(getActionPath(undefined, 'http://localhost')).toBeUndefined();
    });

    test('returns the pathname for a bare path', () => {
        expect(getActionPath(resourceRoutes.setSiteContext, 'http://localhost')).toBe(resourceRoutes.setSiteContext);
    });

    test('strips a trailing query string (e.g. an index-route ?index)', () => {
        expect(getActionPath(`${resourceRoutes.setSiteContext}?index`, 'http://localhost')).toBe(
            resourceRoutes.setSiteContext
        );
    });

    test('drops the origin from an absolute URL, keeping the pathname', () => {
        expect(getActionPath(`http://localhost${resourceRoutes.setSiteContext}?foo=bar`, 'http://localhost')).toBe(
            resourceRoutes.setSiteContext
        );
    });
});

describe('isContextMutation', () => {
    test('matches set-site-context', () => {
        expect(isContextMutation(resourceRoutes.setSiteContext)).toBe(true);
    });

    test('matches update-shopper-context', () => {
        expect(isContextMutation(resourceRoutes.updateShopperContext)).toBe(true);
    });

    // The context dimension is exact-match on the unprefixed /action/* routes only — identity routes are a separate
    // dimension (isIdentityMutation). api-client.ts admits this predicate alone, so this exclusion is load-bearing:
    // a login/logout must NOT reload the resource-route fetchers (the basket re-seeds server-side on the redirect).
    test('does NOT match the unprefixed login path', () => {
        expect(isContextMutation(routes.login)).toBe(false);
    });

    test('does NOT match a site/locale-prefixed logout path', () => {
        expect(isContextMutation('/RefArchGlobal/en-US/logout')).toBe(false);
    });

    test('does NOT match an add-to-cart action', () => {
        expect(isContextMutation(resourceRoutes.cartItemAdd)).toBe(false);
    });

    test('does NOT match a selected-store change', () => {
        expect(isContextMutation(resourceRoutes.setSelectedStore)).toBe(false);
    });
});

describe('isIdentityMutation', () => {
    test.each([
        resourceRoutes.verifyPasswordlessOtp,
        resourceRoutes.passkeyFinishAuthentication,
        resourceRoutes.postOrderRegister,
        routes.resetPassword,
    ])('refreshes identity-dependent reads after %s', (path) => {
        expect(isIdentityMutation(path)).toBe(true);
        expect(isIdentityMutation(`/MarketStreet/en-US${path}`)).toBe(true);
        expect(isAmbientMutation(path)).toBe(true);
    });

    test('matches the unprefixed login path', () => {
        expect(isIdentityMutation(routes.login)).toBe(true);
    });

    test('matches the unprefixed signup path', () => {
        expect(isIdentityMutation(routes.signup)).toBe(true);
    });

    test('matches the unprefixed logout path', () => {
        expect(isIdentityMutation(routes.logout)).toBe(true);
    });

    test('matches a site/locale-prefixed login path', () => {
        expect(isIdentityMutation('/RefArchGlobal/en-US/login')).toBe(true);
    });

    test('matches a site/locale-prefixed signup path', () => {
        expect(isIdentityMutation('/RefArchGlobal/en-US/signup')).toBe(true);
    });

    test('matches a site/locale-prefixed logout path', () => {
        expect(isIdentityMutation('/RefArchGlobal/en-US/logout')).toBe(true);
    });

    test('does NOT match a path that merely ends in an identity segment as a substring', () => {
        // Leading-slash anchoring: /account/auto-logout must not match /logout.
        expect(isIdentityMutation('/RefArchGlobal/en-US/auto-logout')).toBe(false);
    });

    test('does NOT match a context (set-site-context) route', () => {
        expect(isIdentityMutation(resourceRoutes.setSiteContext)).toBe(false);
    });
});

describe('isAmbientMutation', () => {
    describe('the context dimension (currency / shopper-context, unprefixed /action/* routes)', () => {
        test('matches set-site-context', () => {
            expect(isAmbientMutation(resourceRoutes.setSiteContext)).toBe(true);
        });

        test('matches update-shopper-context', () => {
            expect(isAmbientMutation(resourceRoutes.updateShopperContext)).toBe(true);
        });
    });

    describe('the auth identity dimension (site/locale-prefixed routes)', () => {
        test('matches the unprefixed login path', () => {
            expect(isAmbientMutation(routes.login)).toBe(true);
        });

        test('matches the unprefixed signup path', () => {
            expect(isAmbientMutation(routes.signup)).toBe(true);
        });

        test('matches the unprefixed logout path', () => {
            expect(isAmbientMutation(routes.logout)).toBe(true);
        });

        test('matches a site/locale-prefixed login path', () => {
            expect(isAmbientMutation('/RefArchGlobal/en-US/login')).toBe(true);
        });

        test('matches a site/locale-prefixed logout path', () => {
            expect(isAmbientMutation('/RefArchGlobal/en-US/logout')).toBe(true);
        });

        test('does NOT match a path that merely ends in an identity segment as a substring', () => {
            expect(isAmbientMutation('/RefArchGlobal/en-US/auto-logout')).toBe(false);
        });
    });

    describe('non-ambient mutations', () => {
        test('does NOT match an add-to-cart action', () => {
            expect(isAmbientMutation(resourceRoutes.cartItemAdd)).toBe(false);
        });

        test('does NOT match a wishlist action', () => {
            expect(isAmbientMutation(resourceRoutes.wishlistAdd)).toBe(false);
        });

        // setSelectedStore / cartPickupStoreUpdate are deliberately excluded — a store change only stales reads that
        // pass query.inventoryIds, which the suppress-by-default page loaders don't. Pin that decision here.
        test('does NOT match a selected-store change', () => {
            expect(isAmbientMutation(resourceRoutes.setSelectedStore)).toBe(false);
        });
    });
});
