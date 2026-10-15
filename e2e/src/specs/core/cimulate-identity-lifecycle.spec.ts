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
 * Cimulate (Commerce Client Shopper Agent) Identity Lifecycle E2E Tests
 *
 * Verifies `<CimulateAgent>`'s login/logout identity-relinking behavior (see
 * src/components/cimulate/README.md#identity-lifecycle-login-logout-account-switch-guest-rotation)
 * against the real app shell and auth middleware, with the Commerce Client widget and
 * Token Bridge response stubbed (`cimulate-stub.ts`). This observes client requests, not
 * server-side bridge validation, and makes no real SCRT2/Core calls.
 *
 * Single tag: @cimulate (Feature-level).
 *
 * CI never runs this suite: not tagged @core/@smoke, and the runtime guard below skips on real
 * CI or a non-localhost BASE_URL — same pattern as checkout-turnstile.spec.ts.
 *
 * Prerequisite (storefront app `.env`, NOT `e2e/.env`) — the widget's enabled/disabled state and
 * script URL come from the app's SERVER-rendered config (`root.tsx` reads it from
 * `useRouteLoaderData('root')`, which always wins over any client-side config override), so
 * there is no way to toggle it on from the e2e process. Set:
 *
 *   PUBLIC__app__commerce__shopperAgent={"enabled":"true","provider":"commerce-client","commerceClientScriptSourceUrl":"https://cdn.search.cimulate.ai/e2e-fake-bundle.js","scrt2Url":"https://e2e-fake.salesforce-scrt.com","salesforceOrgId":"00De2e0000000001","esDeveloperName":"E2E_Fake_Agent"}
 *
 * (must match `CIMULATE_E2E_CONFIG` in `../../utils/cimulate-stub.ts`), then restart `pnpm dev`.
 */

Feature('Cimulate Shopper Agent - Identity Lifecycle').tag('@cimulate');

const { storefrontPage, loginPage, loginFlow, cimulatePage } = inject();
import { expect } from 'chai';
import { installCimulateStubHooks, getCapturedTokenBridgeRequests } from '../../utils/cimulate-stub';
import { isRealCiEnv } from '../../utils/env';

const baseUrl = process.env.BASE_URL || 'http://localhost:5173';
const isCI = isRealCiEnv(process.env.CI);
const isLocalhost = new URL(baseUrl).hostname === 'localhost';
const CimulateScenario = !isCI && isLocalhost ? Scenario : Scenario.skip;

installCimulateStubHooks();

Before(async () => {
    // Reset to a logged-out, fresh-conversation baseline before every scenario: clear auth
    // cookies, load the storefront once to get a document context, clear the Commerce Client's
    // sessionStorage conversation keys, then reload so the observed page load starts clean.
    await storefrontPage.clearCookies();
    storefrontPage.navigate();
    await cimulatePage.getSettledFakeState(1);
    await cimulatePage.clearConversationState();
    storefrontPage.navigate();
    await storefrontPage.handleTrackingConsent();
});

CimulateScenario('Guest page load links identity once on a brand-new conversation', async () => {
    const state = await cimulatePage.getSettledFakeState(1);
    expect(state.injectCalls, 'widget injected exactly once').to.equal(1);
    expect(state.authLinkKeyCalls, 'identity linked exactly once').to.equal(1);
    expect(state.completedTokenBridgeCalls, 'Token Bridge completed exactly once').to.equal(1);
    expect(state.endConversationCalls, 'conversation never ended for a fresh guest').to.equal(0);

    const widgetPresent = await cimulatePage.isWidgetContainerPresent();
    expect(widgetPresent, 'widget container is present').to.be.true;
});

CimulateScenario('Resumed conversation on reload links again without errors', async () => {
    await cimulatePage.getSettledFakeState(1);

    storefrontPage.navigate();
    const state = await cimulatePage.getSettledFakeState(1);
    expect(state.injectCalls, 'widget injected exactly once on the reloaded page').to.equal(1);
    expect(state.authLinkKeyCalls, 'identity linked exactly once on the reloaded page').to.equal(1);
    expect(state.completedTokenBridgeCalls, 'Token Bridge completed exactly once on reload').to.equal(1);
});

CimulateScenario('Login re-links identity without ending the conversation', async () => {
    const guest = await loginFromGuestBaseline();
    const state = await cimulatePage.getSettledFakeState(guest.authLinkKeyCalls + 1);
    expect(state.injectCalls, 'widget was never remounted across login').to.equal(1);
    expect(state.authLinkKeyCalls, 'identity re-linked once for login').to.equal(guest.authLinkKeyCalls + 1);
    expect(state.completedTokenBridgeCalls, 'one additional Token Bridge call completed for login').to.equal(
        guest.completedTokenBridgeCalls + 1
    );
    expect(state.endConversationCalls, 'conversation is not ended on login').to.equal(0);

    const fakeMessageVisible = await cimulatePage.isFakeChatMessageVisible();
    expect(fakeMessageVisible, 'chat history survives the login re-link').to.be.true;
});

CimulateScenario('Logout ends without re-linking; explicitly starting a fresh conversation links once', async () => {
    const guest = await loginFromGuestBaseline();
    const registered = await cimulatePage.getSettledFakeState(guest.authLinkKeyCalls + 1);
    expect(registered.authLinkKeyCalls, 'login re-linked exactly once').to.equal(guest.authLinkKeyCalls + 1);
    expect(registered.completedTokenBridgeCalls, 'login bridge completed exactly once').to.equal(
        guest.completedTokenBridgeCalls + 1
    );

    storefrontPage.logoutViaHeaderMenu();
    await storefrontPage.waitForSessionCookies('guest');

    const state = await cimulatePage.getSettledFakeState(registered.authLinkKeyCalls, 1);
    expect(state.injectCalls, 'widget was never remounted across logout').to.equal(1);
    expect(state.endConversationCalls, 'conversation ended exactly once on logout').to.equal(1);
    expect(state.authLinkKeyCalls, 'logout does not re-link the ended conversation').to.equal(
        registered.authLinkKeyCalls
    );
    expect(state.completedTokenBridgeCalls, 'logout sends no additional Token Bridge call').to.equal(
        registered.completedTokenBridgeCalls
    );

    const fakeMessageVisible = await cimulatePage.isFakeChatMessageVisible();
    expect(fakeMessageVisible, 'prior chat is cleared by endConversation on logout').to.be.false;

    await cimulatePage.startFreshConversation();
    const fresh = await cimulatePage.getSettledFakeState(registered.authLinkKeyCalls + 1, 1);
    expect(fresh.injectCalls, 'fresh conversation does not remount the widget').to.equal(1);
    expect(fresh.endConversationCalls, 'fresh conversation does not end again').to.equal(1);
    expect(fresh.authLinkKeyCalls, 'explicit fresh conversation links exactly once').to.equal(
        registered.authLinkKeyCalls + 1
    );
    expect(
        fresh.completedTokenBridgeCalls,
        'explicit fresh conversation completes one additional bridge call'
    ).to.equal(registered.completedTokenBridgeCalls + 1);
});

CimulateScenario(
    'Token Bridge requests carry only the AuthLink key in the body, never an Authorization header',
    async () => {
        const guest = await loginFromGuestBaseline();
        const state = await cimulatePage.getSettledFakeState(guest.authLinkKeyCalls + 1);
        expect(state.authLinkKeyCalls, 'login re-linked exactly once').to.equal(guest.authLinkKeyCalls + 1);
        expect(state.completedTokenBridgeCalls, 'login bridge call completed exactly once').to.equal(
            guest.completedTokenBridgeCalls + 1
        );

        const requests = getCapturedTokenBridgeRequests();
        expect(requests.length, 'at least one Token Bridge call was captured').to.be.greaterThan(0);

        for (const request of requests) {
            // Same-origin session cookies are expected; SLAS credentials must not be explicitly forwarded.
            expect(
                Object.keys(request.headers).map((header) => header.toLowerCase()),
                'no Authorization header'
            ).to.not.include('authorization');
            const body: unknown = JSON.parse(request.body || '{}');
            expect(body, 'request body is a plain object').to.be.an('object');
            expect(
                Object.keys(body as Record<string, unknown>),
                'request body only ever carries auth_link_key'
            ).to.deep.equal(['auth_link_key']);
        }
    }
);

async function loginFromGuestBaseline() {
    // Credential setup can sign up and navigate. Measure only after the guest login form has settled.
    const credentials = await loginFlow.getCredentials();
    await storefrontPage.clearCookies();
    loginPage.navigate({ mode: 'password' });
    await storefrontPage.handleTrackingConsent();
    loginPage.validatePageLoaded();
    loginPage.fillLoginForm(credentials);
    await storefrontPage.waitForSessionCookies('guest');
    const guest = await cimulatePage.getSettledFakeState(1);
    expect(guest.authLinkKeyCalls, 'settled login form has exactly one guest link').to.equal(1);
    expect(guest.completedTokenBridgeCalls, 'guest bridge completed before login').to.equal(1);
    loginPage.clickSignIn();
    await loginPage.waitForRedirectAwayFromLogin(30);
    await storefrontPage.waitForSessionCookies('registered');
    return guest;
}

export {};
