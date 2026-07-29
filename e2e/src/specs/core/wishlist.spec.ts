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

Feature('Storefront Wishlist Tests').tag('@core').tag('@wishlist');

// TODO: The "Removing wishlist item updates count accurately" and
// "Wishlist item persists after logout and login" scenarios intermittently
// fail at the login step inside add-to-wishlist.flow with a 30s Email Input
// timeout. Observed across multiple unrelated PR branches on stg-016.
// Tracked in W-22970888 (CC Sharks). Re-enable when the underlying flake
// is fixed.
const isWishlistLoginFlaky = true;
const wishlistLoginScenario = isWishlistLoginFlaky ? Scenario.skip : Scenario;

// TODO: "Wishlist item added from PDP persists after wishlist page refresh"
// intermittently fails AFTER the refresh: login + add succeed and the item
// renders before refresh, then waitForElement(Wishlist Item) times out after
// I.refreshPage() — the add hasn't durably persisted (suspected SCAPI
// read-after-write lag under parallel CI load). Distinct from the login-timeout
// flake above. Observed on 5+ unrelated PR branches on 2026-07-23; passes on
// main nightly. Tracked in W-22970888 (CC Sharks). Re-enable when the
// underlying persistence lag is fixed.
const isWishlistRefreshFlaky = true;
const wishlistRefreshScenario = isWishlistRefreshFlaky ? Scenario.skip : Scenario;

const { I, apiLoginFlow, storefrontPage, addToWishlistFlow, accountWishlistPage } = inject();
import { expect } from 'chai';

Scenario('Registered shopper can add product to wishlist and see it in account wishlist', async () => {
    const productTitle = await addToWishlistFlow.execute();

    accountWishlistPage.navigate();
    const { itemCount, itemTexts } = await accountWishlistPage.pollUntilItemsAppear();

    expect(itemCount, 'Expected wishlist to contain at least one item after adding').to.be.greaterThan(0);

    const productPresent = itemTexts.some((text) => text.toLowerCase().includes(productTitle.toLowerCase()));
    expect(productPresent, `Expected wishlist to contain added product "${productTitle}"`).to.be.true;
})
    .tag('@registered-shopper')
    .tag('@happy-path')
    .tag('@wishlist-add');

wishlistRefreshScenario('Wishlist item added from PDP persists after wishlist page refresh', async () => {
    const productTitle = await addToWishlistFlow.execute();

    accountWishlistPage.navigate();
    const firstLoad = await accountWishlistPage.pollUntilItemsAppear();

    expect(firstLoad.itemCount, 'Expected wishlist to contain at least one item before refresh').to.be.greaterThan(0);
    const appearsBeforeRefresh = firstLoad.itemTexts.some((text) =>
        text.toLowerCase().includes(productTitle.toLowerCase())
    );
    expect(appearsBeforeRefresh, `Expected wishlist to contain "${productTitle}" before refresh`).to.be.true;

    I.refreshPage();
    I.seeInCurrentUrl(accountWishlistPage.path);
    const afterRefresh = await accountWishlistPage.pollUntilItemsAppear();

    expect(afterRefresh.itemCount, 'Expected wishlist to contain at least one item after refresh').to.be.greaterThan(0);
    const appearsAfterRefresh = afterRefresh.itemTexts.some((text) =>
        text.toLowerCase().includes(productTitle.toLowerCase())
    );
    expect(appearsAfterRefresh, `Expected wishlist to still contain "${productTitle}" after refresh`).to.be.true;
})
    .tag('@registered-shopper')
    .tag('@happy-path')
    .tag('@wishlist-add')
    .tag('@persistence');

wishlistLoginScenario('Removing wishlist item updates count accurately', async () => {
    await addToWishlistFlow.execute();

    accountWishlistPage.navigate();
    const { itemCount: beforeCount } = await accountWishlistPage.pollUntilItemsAppear();

    expect(beforeCount, 'Expected at least one wishlist item before removal').to.be.greaterThan(0);

    accountWishlistPage.removeFirstItem();

    const afterCount = await accountWishlistPage.pollUntilCount(beforeCount - 1);
    expect(afterCount, 'Expected wishlist item count to decrease by one after removal').to.equal(beforeCount - 1);
})
    .tag('@registered-shopper')
    .tag('@happy-path')
    .tag('@wishlist-remove')
    .tag('@count');

wishlistLoginScenario('Wishlist item persists after logout and login', async () => {
    const productTitle = await addToWishlistFlow.execute();

    accountWishlistPage.navigate();
    const beforeLogout = await accountWishlistPage.pollUntilItemsAppear();

    expect(beforeLogout.itemCount, 'Expected at least one wishlist item before logout').to.be.greaterThan(0);
    const appearsBeforeLogout = beforeLogout.itemTexts.some((text) =>
        text.toLowerCase().includes(productTitle.toLowerCase())
    );
    expect(appearsBeforeLogout, `Expected wishlist to contain "${productTitle}" before logout`).to.be.true;

    await storefrontPage.logout();
    await apiLoginFlow.executeWithEnsuredCredentials();

    accountWishlistPage.navigate();
    const afterRelogin = await accountWishlistPage.pollUntilItemsAppear();

    expect(afterRelogin.itemCount, 'Expected at least one wishlist item after re-login').to.be.greaterThan(0);
    const appearsAfterRelogin = afterRelogin.itemTexts.some((text) =>
        text.toLowerCase().includes(productTitle.toLowerCase())
    );
    expect(appearsAfterRelogin, `Expected wishlist to still contain "${productTitle}" after re-login`).to.be.true;
})
    .tag('@registered-shopper')
    .tag('@happy-path')
    .tag('@wishlist-add')
    .tag('@session');

export {};
