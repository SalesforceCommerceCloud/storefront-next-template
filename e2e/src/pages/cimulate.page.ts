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

const { I } = inject();

/** Call counters recorded on `window.__cimulateFake` by the fake Commerce Client bundle. */
interface CimulateFakeState {
    injectCalls: number;
    authLinkKeyCalls: number;
    completedTokenBridgeCalls: number;
    endConversationCalls: number;
    endingConversation: boolean;
}

interface CimulateFakeWindow extends Window {
    __cimulateFake?: CimulateFakeState & { startConversation: () => void };
}

/**
 * Cimulate (Commerce Client) Widget Page Object
 * Reads state the fake bundle (`cimulate-stub.ts`) records on `window.__cimulateFake`,
 * and inspects the widget container it injects into.
 */
class CimulatePage {
    locators = {
        widgetContainer: locate('[data-testid="cimulate-agent-widget"]').as('Cimulate Widget Container'),
        fakeMessage: locate('[data-testid="cimulate-fake-message"]').as('Cimulate Fake Chat Message'),
    };

    /** Reads the fake bundle's call counters. Missing fields default to 0 (bundle not yet loaded). */
    async getFakeState(): Promise<CimulateFakeState> {
        return await (I.usePlaywrightTo('read Cimulate fake bundle state', async ({ page }) => {
            return await page.evaluate(() => {
                const w = window as CimulateFakeWindow;
                return {
                    injectCalls: w.__cimulateFake?.injectCalls ?? 0,
                    authLinkKeyCalls: w.__cimulateFake?.authLinkKeyCalls ?? 0,
                    completedTokenBridgeCalls: w.__cimulateFake?.completedTokenBridgeCalls ?? 0,
                    endConversationCalls: w.__cimulateFake?.endConversationCalls ?? 0,
                    endingConversation: w.__cimulateFake?.endingConversation ?? false,
                };
            });
        }) as unknown as Promise<CimulateFakeState>);
    }

    /** Observes completed bridge calls and reset, then snapshots after a bounded 1s duplicate window. */
    async getSettledFakeState(
        count: number,
        endConversationCount: number = 0,
        timeoutMs: number = 10000
    ): Promise<CimulateFakeState> {
        await (I.usePlaywrightTo('observe settled Cimulate identity links', async ({ page }) => {
            const complete = ({ links, ends }: { links: number; ends: number }): boolean => {
                const state = (window as CimulateFakeWindow).__cimulateFake;
                return (
                    !!state &&
                    state.authLinkKeyCalls >= links &&
                    state.completedTokenBridgeCalls >= state.authLinkKeyCalls &&
                    state.endConversationCalls >= ends &&
                    !state.endingConversation
                );
            };
            const expected = { links: count, ends: endConversationCount };
            await page.waitForFunction(complete, expected, { timeout: timeoutMs });
            await new Promise((resolve) => setTimeout(resolve, 1000));
            await page.waitForFunction(complete, expected, { timeout: timeoutMs });
        }) as unknown as Promise<void>);
        return await this.getFakeState();
    }

    /** Explicitly starts a fake conversation; ending one never starts a replacement. */
    async startFreshConversation(): Promise<void> {
        await (I.usePlaywrightTo('start a fresh Cimulate fake conversation', async ({ page }) => {
            await page.evaluate(() => {
                (window as CimulateFakeWindow).__cimulateFake?.startConversation();
            });
        }) as unknown as Promise<void>);
    }

    async isWidgetContainerPresent(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.widgetContainer);
        return count > 0;
    }

    async isFakeChatMessageVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.fakeMessage);
        return count > 0;
    }

    /**
     * Clears the Commerce Client's stored conversation keys so the next widget-ready
     * event is treated as a brand-new conversation. Must be called after a navigation has
     * loaded the storefront origin (storage access errors on an unloaded page).
     */
    async clearConversationState(): Promise<void> {
        await (I.usePlaywrightTo('clear Cimulate conversation storage', async ({ page }) => {
            await page.evaluate(() => {
                localStorage.clear();
                sessionStorage.clear();
            });
        }) as unknown as Promise<void>);
    }
}

export = new CimulatePage();
