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

Feature('Storefront Add to Cart Tests').tag('@core').tag('@cart');

const { cartPage, addToCartFlow, signupFlow, apiSignupFlow, storefrontPage, loginFlow } = inject();
import { expect } from 'chai';

/**
 * Clear all browser cookies before each scenario.
 *
 * The Playwright browser context is reused across scenarios (no `restart` is configured),
 * so auth cookies from one scenario carry over to the next. Concretely: Scenario 2
 * ("Registered shopper add to cart") ends with the user logged in. Scenario 3
 * ("basket merge") then starts in that same logged-in state and calls
 * `signupFlow.execute()`, which navigates to /signup. The storefront redirects
 * authenticated users away from the signup page, so the form never loads and the
 * scenario fails.
 *
 * Clearing cookies before each scenario resets the browser to an unauthenticated
 * guest state, equivalent to opening a fresh tab. The storefront issues a new guest
 * session on the first navigation, so every scenario starts fully independent.
 *
 * Note on guest basket isolation: SFCC deletes `cc-nx-g` (guest refresh token) when
 * a shopper logs in, and creates a fresh one on logout, so guest baskets do NOT bleed
 * across login/logout boundaries. The cookie clear here is only needed to fix the
 * logged-in state that persists when no logout occurs between scenarios.
 */
Before(async () => {
    await storefrontPage.clearCookies();
});

/**
 * Guest Shopper Add to Cart Scenario
 *
 * Test Flow:
 * 1. Navigate directly to category page (Womens > Tops)
 * 2. Click "More Options" for first product (data agnostic)
 * 3. Shopper is navigated to product details
 * 4. Product selects all available options for variants (dynamic)
 * 5. Shopper clicks Add to Cart
 * 6. Navigate to /cart
 * 7. Assert item in cart matches item added (title, quantity, price)
 *
 * Note: Uses direct URL navigation for reliability.
 * For mega-menu navigation testing, see navigation.spec.ts
 */
Scenario('Guest shopper should be able to add items to cart', async () => {
    // Execute the add-to-cart flow with direct category navigation
    // Update the URL to match your storefront's category structure
    const productInfo = await addToCartFlow.execute('c/mens-clothing-jackets');

    // Navigate to cart page to validate
    cartPage.navigate('/cart');

    // Validate cart has items
    cartPage.validateCartHasItems();

    // Get cart item count
    const cartItemCount = await cartPage.getCartItemCount();
    expect(cartItemCount, 'Cart should have at least 1 item').to.be.greaterThan(0);

    // Find the cart item that matches the product we just added.
    // Index order can vary depending on existing cart state.
    let foundIndex = -1;
    for (let i = 0; i < cartItemCount; i++) {
        const cartItemTitle = await cartPage.getItemTitle(i);
        if (cartItemTitle.toLowerCase().includes(productInfo.title.toLowerCase())) {
            foundIndex = i;
            break;
        }
    }
    expect(foundIndex, `Cart should contain product "${productInfo.title}"`).to.be.greaterThan(-1);

    const cartItemQuantity = await cartPage.getItemQuantity(foundIndex);
    const cartItemPrice = await cartPage.getItemPrice(foundIndex);

    // Validate quantity matches
    expect(cartItemQuantity, 'Cart item quantity should match selected quantity').to.equal(productInfo.quantity);

    // Validate price exists in cart (skipping PDP price comparison)
    expect(cartItemPrice, 'Cart item should have a price').to.not.be.empty;
})
    .tag('@add-to-cart')
    .tag('@guest-checkout')
    .tag('@smoke');

/**
 * Registered Shopper Add to Cart Scenario
 *
 * Test Flow:
 * 1. Execute login flow (creates account if needed, handles existing credentials)
 * 2. Navigate to category and add product to cart
 * 3. Navigate to cart page
 * 4. Validate the newly added item exists in cart
 *
 * Note: Registered user may have existing items from previous sessions.
 * This test focuses on validating the new item is added, not exact cart count.
 */
Scenario('Registered shopper should be able to add items to cart', async () => {
    // Create a fresh account and auto-login. Using a signup flow (not loginFlow) ensures
    // each execution — including retries — starts with an empty SFCC basket. Reusing a
    // stored account across retries causes basket accumulation (each retry adds 1 item,
    // so qty grows to 2, 3, … and the qty===1 assertion fails). apiSignupFlow registers
    // via SCAPI and injects the session — login here is setup, not the subject.
    await apiSignupFlow.execute();

    // Execute the add-to-cart flow with direct category navigation
    const productInfo = await addToCartFlow.execute('c/mens-clothing-jackets');

    // Navigate to cart page to validate
    cartPage.navigate('/cart');

    // Validate cart has items
    cartPage.validateCartHasItems();

    // Get cart item count (registered user may have existing items)
    const cartItemCount = await cartPage.getCartItemCount();
    expect(cartItemCount, 'Cart should have at least 1 item').to.be.greaterThan(0);

    // Find the cart item that matches the product we just added (order may vary)
    let foundIndex = -1;
    for (let i = 0; i < cartItemCount; i++) {
        const cartItemTitle = await cartPage.getItemTitle(i);
        if (cartItemTitle.toLowerCase().includes(productInfo.title.toLowerCase())) {
            foundIndex = i;
            break;
        }
    }
    expect(foundIndex, `Cart should contain product "${productInfo.title}"`).to.be.greaterThan(-1);

    const cartItemQuantity = await cartPage.getItemQuantity(foundIndex);
    const cartItemPrice = await cartPage.getItemPrice(foundIndex);

    // Validate quantity matches
    expect(cartItemQuantity, 'Cart item quantity should match selected quantity').to.equal(productInfo.quantity);

    // Validate price exists in cart
    expect(cartItemPrice, 'Cart item should have a price').to.not.be.empty;
})
    .tag('@add-to-cart')
    .tag('@registered-shopper');

/**
 * Guest to Registered Shopper Basket Merge Scenario
 *
 * Test Flow:
 * 1. Create a fresh account (no basket) via signup and logout
 * 2. Add product to cart as guest
 * 3. Validate item is in cart
 * 4. Login with fresh account (triggers basket merge on Commerce Cloud backend)
 * 5. Validate guest item still exists in cart after merge
 *
 * Creates its own account to avoid shared-state failures when running
 * as part of the full suite (previous tests may have polluted the
 * credential store's account with existing basket items).
 */
Scenario('Guest item should persist in cart after login (basket merge)', async () => {
    // Create a fresh account with no basket to ensure test isolation. apiSignupFlow
    // registers via SCAPI and injects the registered session — signup is setup here,
    // not the subject. The merge itself is still driven through the UI loginFlow below.
    const { signupData } = await apiSignupFlow.execute();

    // Logout to return to guest state before testing basket merge
    await storefrontPage.logout();

    // Execute add-to-cart flow as guest
    const productInfo = await addToCartFlow.execute('c/mens-clothing-jackets');

    // Navigate to cart and validate item added as guest
    cartPage.navigate('/cart');
    cartPage.validateCartHasItems();

    // Get cart state before login - match by title instead of assuming index order.
    const guestCartItemCountBeforeLogin = await cartPage.getCartItemCount();
    let foundGuestItemBeforeLogin = false;
    for (let i = 0; i < guestCartItemCountBeforeLogin; i++) {
        const guestCartItemTitle = await cartPage.getItemTitle(i);
        if (guestCartItemTitle.toLowerCase().includes(productInfo.title.toLowerCase())) {
            foundGuestItemBeforeLogin = true;
            break;
        }
    }
    expect(foundGuestItemBeforeLogin, `Guest cart should contain product "${productInfo.title}" before login`).to.be
        .true;

    // Login with the fresh account (triggers basket merge with an empty registered basket)
    await loginFlow.executeWithCredentials(signupData.email, signupData.password);

    // Navigate back to cart to validate basket merge
    cartPage.navigate('/cart');

    // Validate cart still has items after login
    cartPage.validateCartHasItems();

    const cartItemCount = await cartPage.getCartItemCount();
    expect(cartItemCount, 'Cart should have at least 1 item after login').to.be.greaterThan(0);

    // Validate the guest item still exists in cart (basket merge successful)
    // Note: Item may not be at index 0 if registered user had existing items,
    // so we check all cart items for a match
    let foundGuestItem = false;
    for (let i = 0; i < cartItemCount; i++) {
        const itemTitle = await cartPage.getItemTitle(i);
        if (itemTitle.toLowerCase().includes(productInfo.title.toLowerCase())) {
            foundGuestItem = true;

            // Validate quantity of the merged item
            const itemQuantity = await cartPage.getItemQuantity(i);
            expect(
                itemQuantity,
                `Guest item "${productInfo.title}" should maintain quantity after basket merge`
            ).to.equal(productInfo.quantity);

            break;
        }
    }

    expect(foundGuestItem, `Guest item "${productInfo.title}" should exist in cart after login (basket merge)`).to.be
        .true;
})
    .tag('@add-to-cart')
    .tag('@basket-merge')
    .tag('@registered-shopper');

/**
 * Registered Shopper with Existing Basket Merge Scenario
 *
 * Test Flow:
 * 1. Create a new registered account with an item in basket (via signupFlow with createBasket: true,
 *    category: mens-clothing-jackets); account is auto-logged in, item added, then logged out
 * 2. Add a product from a different category (womens-clothing-tops) to cart as guest — using a
 *    different category ensures SFCC keeps the two items as separate line items rather than merging
 *    them into one line item with a combined quantity
 * 3. Validate the guest item is present in cart before login
 * 4. Login with the registered user (triggers basket merge on the Commerce Cloud backend)
 * 5. Validate both items exist in cart as separate line items after merge:
 *    - Registered user's original item persists with its original quantity
 *    - Guest item is merged into the cart with its original quantity
 *    - If both flows selected the same product, the test fails fast with a clear error
 *
 * This validates that when both the registered and guest baskets contain distinct items,
 * the merge preserves both as separate line items.
 */
Scenario('Registered shopper with existing basket merges with guest basket on login', async () => {
    // Create new account with an item in basket, then logout
    // This simulates a registered user who previously added an item
    const { signupData, productInfo: registeredUserProduct } = await signupFlow.execute({
        createBasket: true,
        categoryUrl: 'c/mens-clothing-jackets',
    });

    expect(registeredUserProduct, 'Basket creation during signup failed — productInfo is undefined').to.not.be
        .undefined;

    // At this point:
    // - New account created
    // - Item added to registered user's basket
    // - User logged out (now in guest state)

    // Add a different product to cart as guest — intentionally use a different category
    // so SFCC treats the two items as separate line items rather than merging them
    // into a single line item with combined quantity.
    const guestProduct = await addToCartFlow.execute('c/womens-clothing-tops');

    // Navigate to cart and validate guest item is present
    cartPage.navigate('/cart');
    cartPage.validateCartHasItems();

    const guestCartItemCountBeforeLogin = await cartPage.getCartItemCount();
    let foundGuestItemBeforeLogin = false;
    for (let i = 0; i < guestCartItemCountBeforeLogin; i++) {
        const guestCartItemTitle = await cartPage.getItemTitle(i);
        if (guestCartItemTitle.toLowerCase().includes(guestProduct.title.toLowerCase())) {
            foundGuestItemBeforeLogin = true;
            break;
        }
    }
    expect(foundGuestItemBeforeLogin, `Guest cart should contain product "${guestProduct.title}" before login`).to.be
        .true;

    // Login with the registered user (triggers basket merge)
    await loginFlow.executeWithCredentials(signupData.email, signupData.password);

    // Navigate to cart to validate basket merge
    cartPage.navigate('/cart');
    cartPage.validateCartHasItems();

    const cartItemCount = await cartPage.getCartItemCount();
    expect(cartItemCount, 'Cart should have at least 2 items after basket merge').to.be.greaterThanOrEqual(2);

    // Validate both items exist in cart after merge as separate line items.
    // Each index may only satisfy one flag — if titles match it means we accidentally
    // added the same product twice, which SFCC collapses into a single line item with
    // a combined quantity. That would invalidate the whole scenario.
    let foundRegisteredItem = false;
    let foundGuestItem = false;

    for (let i = 0; i < cartItemCount; i++) {
        const itemTitle = await cartPage.getItemTitle(i);
        const titleLower = itemTitle.toLowerCase();

        const matchesRegistered =
            registeredUserProduct && titleLower.includes(registeredUserProduct.title.toLowerCase());
        const matchesGuest = titleLower.includes(guestProduct.title.toLowerCase());

        if (matchesRegistered && matchesGuest) {
            // Same product in both baskets — SFCC merged them into one line item.
            // This indicates the two flows added the same item, which makes the
            // scenario unable to verify basket merge of distinct products.
            throw new Error(
                `Both the registered user and guest added the same product "${itemTitle}". ` +
                    `Use different category URLs for each flow so SFCC keeps them as separate line items.`
            );
        }

        if (matchesRegistered && !foundRegisteredItem && registeredUserProduct) {
            foundRegisteredItem = true;
            const itemQuantity = await cartPage.getItemQuantity(i);
            expect(
                itemQuantity,
                `Registered user's original item "${registeredUserProduct.title}" should maintain quantity`
            ).to.equal(registeredUserProduct.quantity);
        }

        if (matchesGuest && !foundGuestItem) {
            foundGuestItem = true;
            const itemQuantity = await cartPage.getItemQuantity(i);
            expect(itemQuantity, `Guest item "${guestProduct.title}" should maintain quantity`).to.equal(
                guestProduct.quantity
            );
        }
    }

    expect(
        foundRegisteredItem,
        `Registered user's original item "${registeredUserProduct?.title}" should exist in cart after login`
    ).to.be.true;
    expect(foundGuestItem, `Guest item "${guestProduct.title}" should exist in cart after login (basket merge)`).to.be
        .true;
})
    .tag('@add-to-cart')
    .tag('@basket-merge')
    .tag('@registered-shopper')
    .tag('@basket-merge-existing-items');
