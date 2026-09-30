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
export const testRoutes = [
    {
        id: 'root',
        path: '',
        file: 'root.tsx',
        children: [
            {
                id: 'store-locator-resource.stores',
                path: '/resource/stores',
                file: './extensions/store-locator/routes/resource.stores.ts',
            },
            {
                id: 'store-locator-store-locator',
                path: '/store-locator',
                file: './extensions/store-locator/routes/store-locator.tsx',
            },
            {
                id: 'routes/action.cart-pickup-store-update',
                path: 'action/cart-pickup-store-update',
                file: 'routes/action.cart-pickup-store-update.tsx',
            },
            {
                id: 'routes/action.submit-shipping-address',
                path: 'action/submit-shipping-address',
                file: 'routes/action.submit-shipping-address.ts',
            },
            {
                id: 'routes/action.submit-shipping-options',
                path: 'action/submit-shipping-options',
                file: 'routes/action.submit-shipping-options.ts',
            },
            {
                id: 'routes/action.update-shopper-context',
                path: 'action/update-shopper-context',
                file: 'routes/action.update-shopper-context.ts',
            },
            {
                id: 'routes/resource.api.client.$resource',
                path: 'resource/api/client/:resource',
                file: 'routes/resource.api.client.$resource.ts',
            },
            {
                id: 'routes/action.submit-contact-info',
                path: 'action/submit-contact-info',
                file: 'routes/action.submit-contact-info.ts',
            },
            {
                id: 'routes/resource.wishlist-products',
                path: 'resource/wishlist-products',
                file: 'routes/resource.wishlist-products.tsx',
            },
            {
                id: 'routes/action.cart-bundle-update',
                path: 'action/cart-bundle-update',
                file: 'routes/action.cart-bundle-update.tsx',
            },
            {
                id: 'routes/action.bonus-product-add',
                path: 'action/bonus-product-add',
                file: 'routes/action.bonus-product-add.tsx',
            },
            {
                id: 'routes/action.promo-code-remove',
                path: 'action/promo-code-remove',
                file: 'routes/action.promo-code-remove.tsx',
            },
            {
                id: 'routes/resource.basket-products',
                path: 'resource/basket-products',
                file: 'routes/resource.basket-products.ts',
            },
            {
                id: 'routes/action.cart-item-remove',
                path: 'action/cart-item-remove',
                file: 'routes/action.cart-item-remove.tsx',
            },
            {
                id: 'routes/action.cart-item-update',
                path: 'action/cart-item-update',
                file: 'routes/action.cart-item-update.tsx',
            },
            {
                id: 'routes/action.cart-bundle-add',
                path: 'action/cart-bundle-add',
                file: 'routes/action.cart-bundle-add.tsx',
            },
            {
                id: 'routes/action.wishlist-remove',
                path: 'action/wishlist-remove',
                file: 'routes/action.wishlist-remove.tsx',
            },
            {
                id: 'routes/action.promo-code-add',
                path: 'action/promo-code-add',
                file: 'routes/action.promo-code-add.tsx',
            },
            {
                id: 'routes/action.submit-payment',
                path: 'action/submit-payment',
                file: 'routes/action.submit-payment.ts',
            },
            {
                id: 'routes/action.cart-item-add',
                path: 'action/cart-item-add',
                file: 'routes/action.cart-item-add.tsx',
            },
            {
                id: 'routes/action.cart-set-add',
                path: 'action/cart-set-add',
                file: 'routes/action.cart-set-add.tsx',
            },
            {
                id: 'routes/action.set-currency',
                path: 'action/set-currency',
                file: 'routes/action.set-currency.ts',
            },
            {
                id: 'routes/action.wishlist-add',
                path: 'action/wishlist-add',
                file: 'routes/action.wishlist-add.tsx',
            },
            {
                id: 'routes/action.place-order',
                path: 'action/place-order',
                file: 'routes/action.place-order.ts',
            },
            {
                id: 'routes/action.set-locale',
                path: 'action/set-locale',
                file: 'routes/action.set-locale.ts',
            },
            {
                id: 'routes/_empty',
                file: 'routes/_empty.tsx',
                children: [
                    {
                        id: 'routes/_empty.forgot-password',
                        path: 'forgot-password',
                        file: 'routes/_empty.forgot-password.tsx',
                    },
                    {
                        id: 'routes/_empty.reset-password',
                        path: 'reset-password',
                        file: 'routes/_empty.reset-password.tsx',
                    },
                    {
                        id: 'routes/_empty.oauth2.jwks',
                        path: 'oauth2/jwks',
                        file: 'routes/_empty.oauth2.jwks.ts',
                    },
                    {
                        id: 'routes/_empty.logout',
                        path: 'logout',
                        file: 'routes/_empty.logout.ts',
                    },
                    {
                        id: 'routes/_empty.signup',
                        path: 'signup',
                        file: 'routes/_empty.signup.tsx',
                    },
                    {
                        id: 'routes/_empty.login',
                        path: 'login',
                        file: 'routes/_empty.login.tsx',
                    },
                    {
                        id: 'routes/_empty.$',
                        path: '*',
                        file: 'routes/_empty.$.ts',
                    },
                ],
            },
            {
                id: 'routes/_app',
                file: 'routes/_app.tsx',
                children: [
                    {
                        id: 'routes/_app.order-confirmation.$orderNo',
                        path: 'order-confirmation/:orderNo',
                        file: 'routes/_app.order-confirmation.$orderNo.tsx',
                    },
                    {
                        id: 'routes/_app.c.$',
                        path: 'c/*',
                        file: 'routes/_app.c.$.tsx',
                    },
                    {
                        id: 'routes/_app.p.$',
                        path: 'p/*',
                        file: 'routes/_app.p.$.tsx',
                    },
                    {
                        id: 'routes/_app.about-us',
                        path: 'about-us',
                        file: 'routes/_app.about-us.tsx',
                    },
                    {
                        id: 'routes/_checkout.checkout',
                        path: 'checkout',
                        file: 'routes/_checkout.checkout.tsx',
                    },
                    {
                        id: 'routes/_app.account',
                        path: 'account',
                        file: 'routes/_app.account.tsx',
                        children: [
                            {
                                id: 'routes/_app.account.addresses',
                                path: 'addresses',
                                file: 'routes/_app.account.addresses.tsx',
                            },
                            {
                                id: 'routes/_app.account.overview',
                                path: 'overview',
                                file: 'routes/_app.account.overview.tsx',
                            },
                            {
                                id: 'routes/_app.account.wishlist',
                                path: 'wishlist',
                                file: 'routes/_app.account.wishlist.tsx',
                            },
                            {
                                id: 'routes/_app.account._index',
                                index: true,
                                file: 'routes/_app.account._index.tsx',
                            },
                            {
                                id: 'routes/_app.account.orders',
                                path: 'orders',
                                file: 'routes/_app.account.orders.tsx',
                            },
                        ],
                    },
                    {
                        id: 'routes/_app._index',
                        index: true,
                        file: 'routes/_app._index.tsx',
                    },
                    {
                        id: 'routes/_app.search',
                        path: 'search',
                        file: 'routes/_app.search.tsx',
                    },
                    {
                        id: 'routes/_app.cart',
                        path: 'cart',
                        file: 'routes/_app.cart.tsx',
                    },
                ],
            },
        ],
    },
];

/**
 * Route tree after applyUrlConfig wraps routes under /:siteId/:localeId.
 * The homepage index route is duplicated at "/" (with --root-duplicate IDs) so the
 * bare root URL still works, but cartridge generation should resolve to the
 * canonical prefixed route.
 */
export const testRoutesWithSiteContext = [
    {
        id: 'root',
        path: '',
        file: 'root.tsx',
        children: [
            {
                id: 'routes/_app--root-duplicate',
                file: 'routes/_app.tsx',
                children: [
                    {
                        id: 'routes/_app._index--root-duplicate',
                        index: true,
                        file: 'routes/_app._index.tsx',
                    },
                ],
            },
            {
                id: 'site-context-wrapper',
                file: 'site-context-wrapper.tsx',
                path: ':siteId/:localeId',
                children: [
                    {
                        id: 'routes/_app',
                        file: 'routes/_app.tsx',
                        children: [
                            {
                                id: 'routes/_app._index',
                                index: true,
                                file: 'routes/_app._index.tsx',
                            },
                            {
                                id: 'routes/_app.p.$',
                                path: 'p/*',
                                file: 'routes/_app.p.$.tsx',
                            },
                            {
                                id: 'routes/_app.search',
                                path: 'search',
                                file: 'routes/_app.search.tsx',
                            },
                        ],
                    },
                ],
            },
            {
                id: 'routes/action.set-locale',
                path: 'action/set-locale',
                file: 'routes/action.set-locale.ts',
            },
        ],
    },
];
