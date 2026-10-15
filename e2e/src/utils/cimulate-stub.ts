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
 * Deterministic stub for the Commerce Client (Cimulate) messaging widget.
 *
 * `<CimulateAgent>` only mounts when `commerce.shopperAgent` is enabled in the storefront
 * app's SERVER-rendered config (`root.tsx` reads it from `useRouteLoaderData('root')`, which
 * wins over any `window.__APP_CONFIG__` override injected client-side). Unlike Turnstile's E2E
 * suite, a Playwright `addInitScript` config override cannot toggle this widget on — the app's
 * `.env` must already have it enabled. This module instead fakes the CDN bundle itself and the
 * same-origin Token Bridge route via `page.route()`, so once the widget is enabled, every
 * identity-lifecycle scenario is deterministic (no real SCRT2/Core calls).
 *
 * Prerequisite (storefront app `.env`, NOT `e2e/.env`):
 *   PUBLIC__app__commerce__shopperAgent={"enabled":"true","provider":"commerce-client","commerceClientScriptSourceUrl":"https://cdn.search.cimulate.ai/e2e-fake-bundle.js","scrt2Url":"https://e2e-fake.salesforce-scrt.com","salesforceOrgId":"00De2e0000000001","esDeveloperName":"E2E_Fake_Agent"}
 * (`CIMULATE_E2E_CONFIG` below is the parsed form of that same JSON — keep them in sync.)
 */

import type { Route, Request } from 'playwright';

export const CIMULATE_E2E_CONFIG = {
    enabled: 'true',
    provider: 'commerce-client',
    commerceClientScriptSourceUrl: 'https://cdn.search.cimulate.ai/e2e-fake-bundle.js',
    scrt2Url: 'https://e2e-fake.salesforce-scrt.com',
    salesforceOrgId: '00De2e0000000001',
    esDeveloperName: 'E2E_Fake_Agent',
};

const CONVERSATION_ID_KEY = `cim_af_conv_${CIMULATE_E2E_CONFIG.salesforceOrgId}_${CIMULATE_E2E_CONFIG.esDeveloperName}`;
const CONVERSATION_TOKEN_KEY = `cim_af_ct_${CIMULATE_E2E_CONFIG.salesforceOrgId}_${CIMULATE_E2E_CONFIG.esDeveloperName}`;
const TOKEN_BRIDGE_PATH = '/resource/cimulate-token-bridge';
const TOKEN_BRIDGE_ROUTE = `**${TOKEN_BRIDGE_PATH}`;

/** Captured request bodies the Token Bridge stub has seen, for the "never ships SLAS tokens" assertion. */
export interface CapturedTokenBridgeRequest {
    body: string;
    headers: Record<string, string>;
}

let capturedTokenBridgeRequests: CapturedTokenBridgeRequest[] = [];

/** Fake UMD bundle body: defines `window.CimulateMessaging` and tracks calls on `window.__cimulateFake`. */
function buildFakeBundleScript(): string {
    return `
        window.__cimulateFake = {
            injectCalls: 0,
            authLinkKeyCalls: 0,
            completedTokenBridgeCalls: 0,
            endConversationCalls: 0,
            endingConversation: false,
            elementId: undefined,
        };
        (function () {
            var nativeFetch = window.fetch.bind(window);
            window.fetch = async function (input, init) {
                // Keep completion on the originating fake, even if it is replaced while fetch is pending.
                var fake = window.__cimulateFake;
                var url = new URL(input.url || input, window.location.href);
                var method = (init && init.method) || input.method || 'GET';
                var isBridgePost = url.origin === new URL(window.location.href).origin &&
                    url.pathname.endsWith(${JSON.stringify(TOKEN_BRIDGE_PATH)}) && method.toUpperCase() === 'POST';
                var response = await nativeFetch(input, init);
                if (isBridgePost) {
                    await response.clone().text();
                    fake.completedTokenBridgeCalls += 1;
                }
                return response;
            };
        })();
        window.__cimulateFake.startConversation = function () {
            localStorage.setItem(
                ${JSON.stringify(CONVERSATION_ID_KEY)},
                JSON.stringify({ conversationId: 'fake-conv-' + Date.now(), storedAt: Date.now() })
            );
            sessionStorage.setItem(
                ${JSON.stringify(CONVERSATION_TOKEN_KEY)},
                JSON.stringify({ accessToken: 'fake-token-' + Date.now() + '-' + Math.random() })
            );
            window.dispatchEvent(new CustomEvent('onCimulateWidgetReady'));
        };
        window.CimulateMessaging = {
            CIMULATE_WIDGET_READY_EVENT: 'onCimulateWidgetReady',
            injectMessagingWidget: function (options) {
                window.__cimulateFake.injectCalls += 1;
                window.__cimulateFake.elementId = options && options.elementId;
                var container = document.getElementById(window.__cimulateFake.elementId);
                if (container) {
                    var msg = document.createElement('div');
                    if (options && options.globalClassName) {
                        container.classList.add(options.globalClassName);
                        msg.classList.add(options.globalClassName);
                    }
                    msg.setAttribute('data-testid', 'cimulate-fake-message');
                    msg.textContent = 'fake-chat-message';
                    container.appendChild(msg);
                }
                var convKey = ${JSON.stringify(CONVERSATION_ID_KEY)};
                // Like the real widget: ready fires only for a NEW conversation, never on resume.
                if (!localStorage.getItem(convKey)) {
                    setTimeout(window.__cimulateFake.startConversation, 10);
                }
            },
            getAuthLinkKey: function () {
                window.__cimulateFake.authLinkKeyCalls += 1;
                return Promise.resolve('fake-auth-link-key-' + window.__cimulateFake.authLinkKeyCalls);
            },
            eventHandlers: {
                session: {
                    endConversation: function () {
                        window.__cimulateFake.endConversationCalls += 1;
                        window.__cimulateFake.endingConversation = true;
                        // 1.39 dispatch returns void; storage and chat reset asynchronously, without ready.
                        setTimeout(function () {
                            var container = document.getElementById(window.__cimulateFake.elementId);
                            if (container) container.innerHTML = '';
                            localStorage.removeItem(${JSON.stringify(CONVERSATION_ID_KEY)});
                            sessionStorage.removeItem(${JSON.stringify(CONVERSATION_TOKEN_KEY)});
                            window.__cimulateFake.endingConversation = false;
                        }, 100);
                    },
                },
            },
        };
    `;
}

/** Installs the fake CDN bundle route. Must run before navigation (via `Before` hook). */
async function stubCimulateBundle(): Promise<void> {
    const { I } = inject();
    await I.usePlaywrightTo('stub Cimulate messaging bundle', async ({ page }) => {
        await page.route(CIMULATE_E2E_CONFIG.commerceClientScriptSourceUrl, async (route: Route) => {
            await route.fulfill({
                status: 200,
                headers: { 'content-type': 'application/javascript; charset=utf-8' },
                body: buildFakeBundleScript(),
            });
        });
    });
}

/** Installs the Token Bridge resource-route stub, capturing requests for later assertion. */
async function stubCimulateTokenBridge(): Promise<void> {
    const { I } = inject();
    capturedTokenBridgeRequests = [];
    await I.usePlaywrightTo('stub Cimulate Token Bridge resource route', async ({ page }) => {
        await page.route(TOKEN_BRIDGE_ROUTE, async (route: Route, request: Request) => {
            capturedTokenBridgeRequests.push({
                body: request.postData() ?? '',
                headers: await request.allHeaders(),
            });
            await route.fulfill({
                status: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ success: true }),
            });
        });
    });
}

/** Removes both route stubs installed by `stubCimulateBundle`/`stubCimulateTokenBridge`. */
async function clearCimulateStubs(): Promise<void> {
    const { I } = inject();
    await I.usePlaywrightTo('clear Cimulate stubs', async ({ page }) => {
        await page.unroute(CIMULATE_E2E_CONFIG.commerceClientScriptSourceUrl);
        await page.unroute(TOKEN_BRIDGE_ROUTE);
    });
}

/** Register a Before/After pair that installs both Cimulate stubs for every scenario in the spec. */
export function installCimulateStubHooks(): void {
    Before(async () => {
        await stubCimulateBundle();
        await stubCimulateTokenBridge();
    });
    After(async () => {
        await clearCimulateStubs();
    });
}

/** Requests captured by the Token Bridge stub so far in the current scenario. */
export function getCapturedTokenBridgeRequests(): CapturedTokenBridgeRequest[] {
    return capturedTokenBridgeRequests;
}
