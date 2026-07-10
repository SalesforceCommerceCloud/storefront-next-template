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

/**
 * Page Object Registry
 * Central registration of all page objects for CodeceptJS
 *
 * To add a new page object:
 * 1. Create the page object file in src/pages/
 * 2. Add an entry here with the key and path
 * 3. The page object will automatically be available via inject()
 */
export const pageObjects = {
    storefrontPage: './src/pages/storefront.page.ts',
    cartPage: './src/pages/cart.page.ts',
    checkoutPage: './src/pages/checkout.page.ts',
    productListPage: './src/pages/product-list.page.ts',
    productDetailPage: './src/pages/product-detail.page.ts',
    signupPage: './src/pages/signup.page.ts',
    loginPage: './src/pages/login.page.ts',
    forgotPasswordPage: './src/pages/forgot-password.page.ts',
    resetPasswordPage: './src/pages/reset-password.page.ts',
    accountDetailsPage: './src/pages/account-details.page.ts',
    accountAddressesPage: './src/pages/account-addresses.page.ts',
    accountPaymentMethodsPage: './src/pages/account-payment-methods.page.ts',
    orderListPage: './src/pages/order-list.page.ts',
    orderDetailsPage: './src/pages/order-details.page.ts',
    accountWishlistPage: './src/pages/account-wishlist.page.ts',
    wishlistPage: './src/pages/wishlist.page.ts',
    passwordlessLoginPage: './src/pages/passwordless-login.page.ts',
    securityHeadersPage: './src/pages/security-headers.page.ts',
    previewComponentPage: './src/pages/preview-component.page.ts',
};
