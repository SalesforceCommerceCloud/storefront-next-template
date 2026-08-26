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
 * Guest Order Lookup (GLO) E2E Tests
 * GUS story: G16, W-23351942
 *
 * There is no email inbox available in E2E, so the shopper never receives a
 * real OTP. Scenarios that get past the request-code step stub the
 * `/action/order-lookup-verify` response and the results-page loader via
 * order-lookup-stub.ts instead of round-tripping through real SCAPI.
 * The request-code step itself hits the real BFF action —
 * its response is identical whether or not the order/email pair is real, so no
 * mocking is needed there.
 *
 * Several AC scenarios from the G16 story have no corresponding shipped
 * implementation as of this writing and are stubbed with Scenario.skip below
 * rather than omitted, so the gap stays visible in test reports.
 */

Feature('Guest Order Lookup Tests').tag('@core').tag('@order-lookup');

const { I, orderLookupPage, storefrontPage, apiLoginFlow } = inject();
import { expect } from 'chai';
import {
    stubOrderLookupAction,
    clearOrderLookupActionStub,
    stubOrderLookupResultsLoader,
    clearOrderLookupResultsLoaderStub,
} from '../../utils/order-lookup-stub';

const TEST_EMAIL = 'e2e-glo-test@example.com';

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 1: Happy path — request code, verify, view redacted order details
// ═══════════════════════════════════════════════════════════════════════════════
// Results-loader stub is broken: root loader data cannot be read from the live
// router state in this environment, so the App component crashes mid-navigation.
// Re-enable once the stub is fixed. See PR #2600.
Scenario.skip(
    'SKIPPED (stub broken): Shopper can request a code, verify it, and view their redacted order details',
    async () => {
        // Distinct per scenario: the request-code action sets a per-order cooldown
        // cookie, so reusing an order number across scenarios in the same browser
        // session would make the second request-code call fail with COOLDOWN.
        const orderNumber = 'e2e-glo-happy-path';

        // Real BFF request-code action: its response (and the glo_order_<hash> cookie it
        // sets) is identical whether or not the order/email pair is real, so it's
        // exercised for real. On success the form auto-navigates to the results page,
        // which renders the OTP form because the glo_order_<hash> cookie grants access.
        orderLookupPage.navigate();
        orderLookupPage.fillRequestCodeForm(orderNumber, TEST_EMAIL);
        orderLookupPage.submitRequestCodeForm();
        I.waitForElement(orderLookupPage.locators.otpInput0, 10);

        // Stub the verify action and results loader since no real OTP can be received.
        await stubOrderLookupAction('order-lookup-verify', { ok: true });
        await stubOrderLookupResultsLoader({
            result: {
                ok: true,
                order: { orderNo: orderNumber, productItems: [], shipments: [] },
                productsById: {},
                omsMetaData: null,
            },
            email: TEST_EMAIL,
            orderNumber,
        });

        await orderLookupPage.enterOtp('123456');
        orderLookupPage.submitVerifyForm();

        I.waitForVisible(orderLookupPage.locators.orderDetailsSection, 10);
        const isVisible = await orderLookupPage.isOrderDetailsVisible();
        expect(isVisible, 'Redacted order details should be visible after successful verification').to.be.true;

        const orderNumberText = await orderLookupPage.getOrderNumberText();
        expect(orderNumberText).to.include(orderNumber);

        await clearOrderLookupActionStub('order-lookup-verify');
        await clearOrderLookupResultsLoaderStub();
    }
)
    .tag('@happy-path')
    .tag('@AC1');

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 1b: Guest can cancel their order via the reused CancelOrderDialog
// ═══════════════════════════════════════════════════════════════════════════════
// Results-loader stub is broken — see the happy-path scenario's skip comment. Re-enable with it.
Scenario.skip('SKIPPED (stub broken): Shopper can cancel a cancellable order from the guest results page', async () => {
    const orderNumber = 'e2e-glo-cancel-happy';

    orderLookupPage.navigate();
    orderLookupPage.fillRequestCodeForm(orderNumber, TEST_EMAIL);
    orderLookupPage.submitRequestCodeForm();
    I.waitForElement(orderLookupPage.locators.otpInput0, 10);

    await stubOrderLookupAction('order-lookup-verify', { ok: true });
    await stubOrderLookupResultsLoader({
        result: {
            ok: true,
            order: {
                orderNo: orderNumber,
                productItems: [
                    {
                        itemId: 'item-1',
                        productId: 'prod-1',
                        productName: 'Cancellable Product',
                        quantity: 1,
                        omsData: { status: 'ordered', quantityAvailableToCancel: 1, quantityOrdered: 1 },
                    },
                ],
                shipments: [],
                omsData: {},
            },
            productsById: {},
            omsMetaData: { omsActive: true, cancelReasonCodes: [], returnReasonCodes: [] },
        },
        email: TEST_EMAIL,
        orderNumber,
    });

    await orderLookupPage.enterOtp('123456');
    orderLookupPage.submitVerifyForm();
    I.waitForVisible(orderLookupPage.locators.orderDetailsSection, 10);

    const cancelVisible = await orderLookupPage.isCancelOrderButtonVisible();
    expect(cancelVisible, 'Cancel order button should be visible for a cancellable order').to.be.true;

    orderLookupPage.openCancelDialog();

    // Stub the guest cancel action after the dialog opens — orderNo/reason are
    // read from the dialog's own submit, not needed before this point.
    await stubOrderLookupAction('order-lookup-cancel', {
        success: true,
        order: { orderNo: orderNumber, productItems: [] },
        omsMetaData: { omsActive: true, cancelReasonCodes: [], returnReasonCodes: [] },
    });

    orderLookupPage.confirmCancel();

    I.waitForVisible(orderLookupPage.locators.actionsFeedbackAlert, 10);
    const feedbackText = await orderLookupPage.getActionsFeedbackText();
    expect(feedbackText, 'Feedback alert should confirm the cancellation').to.include('Order canceled');

    await clearOrderLookupActionStub('order-lookup-verify');
    await clearOrderLookupResultsLoaderStub();
    await clearOrderLookupActionStub('order-lookup-cancel');
})
    .tag('@cancel-order')
    .tag('@guest-cancel-return');

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 1c: Guest can return items via the reused ReturnOrderDialog
// ═══════════════════════════════════════════════════════════════════════════════
// Results-loader stub is broken — see the happy-path scenario's skip comment. Re-enable with it.
Scenario.skip('SKIPPED (stub broken): Shopper can return items from the guest results page', async () => {
    const orderNumber = 'e2e-glo-return-happy';

    orderLookupPage.navigate();
    orderLookupPage.fillRequestCodeForm(orderNumber, TEST_EMAIL);
    orderLookupPage.submitRequestCodeForm();
    I.waitForElement(orderLookupPage.locators.otpInput0, 10);

    await stubOrderLookupAction('order-lookup-verify', { ok: true });
    await stubOrderLookupResultsLoader({
        result: {
            ok: true,
            order: {
                orderNo: orderNumber,
                productItems: [
                    {
                        itemId: 'item-1',
                        productId: 'prod-1',
                        productName: 'Returnable Product',
                        quantity: 1,
                        omsData: { status: 'shipped', quantityAvailableToReturn: 1 },
                    },
                ],
                shipments: [],
                omsData: {},
            },
            productsById: {},
            omsMetaData: { omsActive: true, cancelReasonCodes: [], returnReasonCodes: [] },
        },
        email: TEST_EMAIL,
        orderNumber,
    });

    await orderLookupPage.enterOtp('123456');
    orderLookupPage.submitVerifyForm();
    I.waitForVisible(orderLookupPage.locators.orderDetailsSection, 10);

    const returnVisible = await orderLookupPage.isReturnItemsButtonVisible();
    expect(returnVisible, 'Return Items button should be visible for a returnable order').to.be.true;

    orderLookupPage.openReturnDialog();
    await orderLookupPage.checkFirstReturnItem();
    orderLookupPage.reviewReturn();

    await stubOrderLookupAction('order-lookup-return', {
        success: true,
        order: { orderNo: orderNumber, productItems: [] },
        omsMetaData: { omsActive: true, cancelReasonCodes: [], returnReasonCodes: [] },
    });

    orderLookupPage.submitReturn();

    I.waitForVisible(orderLookupPage.locators.actionsFeedbackAlert, 10);
    const feedbackText = await orderLookupPage.getActionsFeedbackText();
    expect(feedbackText, 'Feedback alert should confirm the return').to.include('Return submitted');

    await clearOrderLookupActionStub('order-lookup-verify');
    await clearOrderLookupResultsLoaderStub();
    await clearOrderLookupActionStub('order-lookup-return');
})
    .tag('@return-order')
    .tag('@guest-cancel-return');

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 1d: A terminal cancel failure (404) disables the Cancel button
// ═══════════════════════════════════════════════════════════════════════════════
// Results-loader stub is broken — see the happy-path scenario's skip comment. Re-enable with it.
Scenario.skip(
    'SKIPPED (stub broken): A terminal cancel failure surfaces an error and disables the Cancel order button',
    async () => {
        const orderNumber = 'e2e-glo-cancel-terminal';

        orderLookupPage.navigate();
        orderLookupPage.fillRequestCodeForm(orderNumber, TEST_EMAIL);
        orderLookupPage.submitRequestCodeForm();
        I.waitForElement(orderLookupPage.locators.otpInput0, 10);

        await stubOrderLookupAction('order-lookup-verify', { ok: true });
        await stubOrderLookupResultsLoader({
            result: {
                ok: true,
                order: {
                    orderNo: orderNumber,
                    productItems: [
                        {
                            itemId: 'item-1',
                            productId: 'prod-1',
                            productName: 'Cancellable Product',
                            quantity: 1,
                            omsData: { status: 'ordered', quantityAvailableToCancel: 1, quantityOrdered: 1 },
                        },
                    ],
                    shipments: [],
                    omsData: {},
                },
                productsById: {},
                omsMetaData: { omsActive: true, cancelReasonCodes: [], returnReasonCodes: [] },
            },
            email: TEST_EMAIL,
            orderNumber,
        });

        await orderLookupPage.enterOtp('123456');
        orderLookupPage.submitVerifyForm();
        I.waitForVisible(orderLookupPage.locators.orderDetailsSection, 10);

        orderLookupPage.openCancelDialog();

        await stubOrderLookupAction(
            'order-lookup-cancel',
            { success: false, error: { kind: 'not_found', status: 404 } },
            404
        );

        orderLookupPage.confirmCancel();

        I.waitForVisible(orderLookupPage.locators.actionsFeedbackAlert, 10);
        const feedbackText = await orderLookupPage.getActionsFeedbackText();
        expect(feedbackText, 'Feedback alert should surface the not-found error').to.include('Unable to cancel order');

        const cancelDisabled = await orderLookupPage.isCancelOrderButtonDisabled();
        expect(cancelDisabled, 'Cancel order button should be disabled after a terminal (404) failure').to.be.true;

        await clearOrderLookupActionStub('order-lookup-verify');
        await clearOrderLookupResultsLoaderStub();
        await clearOrderLookupActionStub('order-lookup-cancel');
    }
)
    .tag('@cancel-order')
    .tag('@guest-cancel-return');

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 2: Bad code — repeated wrong attempts surface the attempts hint
// ═══════════════════════════════════════════════════════════════════════════════
Scenario('Repeated wrong codes surface the attempts hint after three failed tries', async () => {
    // Real request-code step: sets the glo_order_<hash> cookie the results page
    // needs to render the OTP form (see the happy-path scenario's comment above).
    // Distinct order number per scenario — see the happy-path scenario's comment
    // on why reusing one across scenarios would trip the per-order cooldown.
    const orderNumber = 'e2e-glo-bad-code';

    orderLookupPage.navigate();
    orderLookupPage.fillRequestCodeForm(orderNumber, TEST_EMAIL);
    orderLookupPage.submitRequestCodeForm();
    I.waitForElement(orderLookupPage.locators.otpInput0, 10);

    await stubOrderLookupAction(
        'order-lookup-verify',
        { ok: false, code: 'INVALID_CODE', message: 'Invalid verification code' },
        401
    );

    // Server-side hint text isn't shown until the client has seen 3 INVALID_CODE
    // responses (verify-form.tsx: showAttemptsHint = clientAttempts >= 3).
    for (let attempt = 1; attempt <= 3; attempt++) {
        await orderLookupPage.enterOtp('000000');
        orderLookupPage.submitVerifyForm();
        I.waitForVisible(orderLookupPage.locators.verifyErrorAlert, 10);
    }

    // The hint and the error banner are mutually exclusive (verify-form.tsx:
    // showAttemptsHint && !errorCode) — editing the code clears errorCode without
    // a new submission, which is exactly what a shopper does before retrying.
    await orderLookupPage.enterOtp('111111');
    I.waitForVisible(orderLookupPage.locators.attemptsHintLink, 10);

    const hintVisible = await orderLookupPage.isAttemptsHintLinkVisible();
    expect(hintVisible, 'Attempts hint link should appear after 3 wrong codes').to.be.true;

    await clearOrderLookupActionStub('order-lookup-verify');
})
    .tag('@bad-code')
    .tag('@AC2');

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 3: Expired code / countdown — SKIPPED, no implementation exists
// ═══════════════════════════════════════════════════════════════════════════════
Scenario.skip(
    'SKIPPED (no implementation): verify form shows an expiry countdown and disables submission once the code expires',
    () => {
        // As of this writing, neither verify-form.tsx nor order-lookup.results.tsx
        // renders a client-side expiry countdown or disables the form on expiry.
        // Expiry is enforced server-side only (SCAPI's fixed 15-minute access-code validity),
        // surfaced as a plain INVALID_CODE error indistinguishable from a wrong code.
        // See G16 AC scenario 3.
    }
)
    .tag('@expired-code')
    .tag('@AC3')
    .tag('@not-implemented');

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 4: Resend cooldown — SKIPPED, no proactive disabled-button UI exists
// ═══════════════════════════════════════════════════════════════════════════════
Scenario.skip('SKIPPED (no implementation): resend button is disabled for a cooldown window after resending', () => {
    // request-code-form.tsx's handleResend() re-shows the form immediately with
    // no disabled state or countdown on the button itself. A cooldown is enforced
    // server-side (COOLDOWN error code + useRateLimitCountdown renders a retry
    // countdown), but only reactively after a rejected submission — there is no
    // proactive disabled-for-N-seconds button state as described in G16 AC scenario 4.
})
    .tag('@resend-cooldown')
    .tag('@AC4')
    .tag('@not-implemented');

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 5: Auth redirect — registered shopper is redirected to /account/orders
// ═══════════════════════════════════════════════════════════════════════════════
const testUserEmail = process.env.E2E_TEST_USER_EMAIL || 'e2e.test.user@gmail.com';
const testUserPassword = process.env.E2E_TEST_USER_PASSWORD;
const authRedirectScenario = testUserPassword ? Scenario : Scenario.skip;

authRedirectScenario('A logged-in shopper visiting /order-lookup is redirected to /account/orders', async () => {
    const siteId = process.env.SITE_ID || 'RefArchGlobal';

    await storefrontPage.clearCookies();
    storefrontPage.navigate();
    await storefrontPage.waitForSessionCookies('guest', siteId, 30);
    await apiLoginFlow.execute({ email: testUserEmail, password: testUserPassword ?? '' });

    orderLookupPage.navigate();

    const currentUrl = await orderLookupPage.getCurrentUrl();
    expect(currentUrl, 'Registered shopper should be redirected away from /order-lookup').to.include('/account/orders');
})
    .tag('@auth-redirect')
    .tag('@AC5');

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 6: Feature flag off — 404, footer link absent
// ═══════════════════════════════════════════════════════════════════════════════
// CAVEAT: the E2E-deployed mirror force-enables the feature via
// PUBLIC__app__guestOrderLookup__enabled=true in storefront-next-ci/e2e-overrides/core.env
// (see config.server.ts — guestOrderLookup.enabled defaults to false, and the mirror
// build needs it on for every other scenario in this file to run at all). There is no
// window.__APP_CONFIG__ override for this flag analogous to checkout-turnstile.spec.ts's
// Turnstile override, because the 404 branch runs in the *server* loader before any
// client script executes — a client-side config override can't retroactively un-404 or
// re-404 a response that already left the server. Exercising the disabled-feature 404
// therefore requires either a second mirror deployment with the flag off, or a
// component/route unit test (see order-lookup._index.test.tsx), not this E2E suite.
//
// Separately: no footer link referencing /order-lookup exists anywhere in the shipped
// template (grepped across src/components/footer/*.tsx and the rest of src/). The AC's
// "footer link is absent" clause has nothing to assert against in any feature-flag state.
Scenario.skip('SKIPPED (env caveat + no implementation): disabled feature 404s and no footer link is shown', () => {
    // See comment block above this scenario for why this can't run against the
    // E2E-deployed mirror, and why the footer-link clause is moot. See G16 AC scenario 6.
})
    .tag('@feature-flag-off')
    .tag('@AC6')
    .tag('@not-implemented');

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 7: Refresh Status button + debounce — SKIPPED, no implementation exists
// ═══════════════════════════════════════════════════════════════════════════════
Scenario.skip('SKIPPED (no implementation): a debounced Refresh Status button re-fetches order status', () => {
    // order-lookup.results.tsx has no "Refresh Status" button or any debounced
    // re-fetch affordance — the order is fetched exactly once, on verification or
    // on auto-fetch from a stored code. See G16 AC scenario 7.
})
    .tag('@refresh-status')
    .tag('@AC7')
    .tag('@not-implemented');

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 8: Session-expired flash on refresh — SKIPPED, no implementation exists
// ═══════════════════════════════════════════════════════════════════════════════
Scenario.skip('SKIPPED (no implementation): refreshing after session expiry shows a session-expired flash', () => {
    // An expired verification-token or code-request cookie silently redirects back
    // to /order-lookup (order-lookup.results.tsx loader) with no flash/toast message
    // explaining why. See G16 AC scenario 8.
})
    .tag('@session-expired')
    .tag('@AC8')
    .tag('@not-implemented');

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 9: Multi-tab overwrite handling — SKIPPED, no implementation exists
// ═══════════════════════════════════════════════════════════════════════════════
Scenario.skip(
    'SKIPPED (no implementation): a second tab requesting a new code does not corrupt the first tab session',
    () => {
        // There is no cross-tab coordination (BroadcastChannel, storage events, etc.)
        // anywhere in the GLO flow. Cookie-scoped state set by a second tab silently
        // overwrites the first tab's cookies with no detection or recovery UI. See G16
        // AC scenario 9.
    }
)
    .tag('@multi-tab-overwrite')
    .tag('@AC9')
    .tag('@not-implemented');
