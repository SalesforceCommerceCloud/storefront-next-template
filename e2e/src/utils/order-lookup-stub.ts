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
 * Per-scenario stub for the Guest Order Lookup `/action/order-lookup-*` routes.
 * OTP codes are emailed server-side and cannot be received in E2E, so the
 * verify/results-fetch steps are exercised by faking the BFF's single-fetch
 * `data()` response instead. Server-side branching is covered by each action's
 * own `*.test.ts` (e.g. action.order-lookup-verify.test.ts).
 */

import type { Route, Request } from 'playwright';

/** One of the GLO action routes this stub can fake a response for. */
export type OrderLookupActionName =
    | 'order-lookup-request-code'
    | 'order-lookup-verify'
    | 'order-lookup-results-fetch'
    | 'order-lookup-cancel'
    | 'order-lookup-return';

/**
 * Install a Playwright route handler that fulfills a GLO action's single-fetch
 * `data()` response. `response` becomes the fetcher's `fetcher.data` on the client.
 */
export async function stubOrderLookupAction(
    actionName: OrderLookupActionName,
    response: unknown,
    status = 200
): Promise<void> {
    const { I } = inject();
    await I.usePlaywrightTo(`stub ${actionName} response`, async ({ page }) => {
        await page.route(`**/action/${actionName}*`, async (route: Route, request: Request) => {
            if (request.method() !== 'POST') {
                await route.continue();
                return;
            }
            await route.fulfill({
                status,
                headers: {
                    'content-type': 'text/x-script; charset=utf-8',
                    'x-remix-response': 'yes',
                },
                body: turboStreamEncode(response),
            });
        });
    });
}

/** Drop the stub so the real BFF action runs again. */
export async function clearOrderLookupActionStub(actionName: OrderLookupActionName): Promise<void> {
    const { I } = inject();
    await I.usePlaywrightTo(`clear ${actionName} stub`, async ({ page }) => {
        await page.unroute(`**/action/${actionName}*`);
    });
}

/**
 * Minimal React Router single-fetch encoder for plain objects with primitive
 * leaves. Mirrors the upstream flatten/stringify walk so output is byte-for-byte
 * decodable by `decodeViaTurboStream`. Handles only the subset this stub needs
 * (same shape produced by `login-prefs-stub.ts`'s private encoder).
 */
function turboStreamEncode(input: unknown): string {
    const slots: string[] = [];
    const indices = new Map<unknown, number>();

    function flatten(value: unknown): number {
        const existing = indices.get(value);
        if (existing !== undefined) return existing;
        const index = slots.length;
        indices.set(value, index);
        slots.push('');
        slots[index] = stringify(value);
        return index;
    }

    function stringify(value: unknown): string {
        if (value === null) return 'null';
        switch (typeof value) {
            case 'boolean':
            case 'number':
            case 'string':
                return JSON.stringify(value);
            case 'object': {
                if (Array.isArray(value)) {
                    return `[${value.map(flatten).join(',')}]`;
                }
                const obj = value as Record<string, unknown>;
                const parts = Object.keys(obj).map((k) => `"_${flatten(k)}":${flatten(obj[k])}`);
                return `{${parts.join(',')}}`;
            }
        }
        throw new Error(`turboStreamEncode: unsupported value of type ${typeof value}`);
    }

    flatten({ data: input });
    return `[${slots.join(',')}]\n`;
}
