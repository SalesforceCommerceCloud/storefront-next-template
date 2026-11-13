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
import { ApiError } from './ApiError';
import type { Clients } from './createClients';
import type { ShopperContext } from './types';

export type NativeShopperContext = ShopperContext.schemas['ShopperContext'];

/**
 * Request-scoped native context access. PATCH merges individual qualifier keys;
 * null removes one key. Never replace existing native context from a cookie replica.
 * An empty patch reconciles the native result without changing qualification.
 * Native errors propagate, including unsupported missing-context behavior.
 */
export function createShopperContextHelpers({ client, usid }: { client: Clients['shopperContext']; usid: string }) {
    if (!usid.trim()) throw new Error('USID is required');
    let snapshot: Promise<NativeShopperContext> | undefined;
    const patch = async (
        body: NativeShopperContext,
        initialContext?: NativeShopperContext
    ): Promise<NativeShopperContext> => {
        try {
            const { data } = await client.updateShopperContext({ params: { path: { usid } }, body });
            return data;
        } catch (error) {
            if (
                !(error instanceof ApiError) ||
                error.status !== 404 ||
                !error.body?.type?.endsWith('/shopper-context-not-found')
            )
                throw error;
            if (Object.keys(body).length === 0) return {};
            // Only an explicit native missing-context fault permits creation. Never
            // replace an existing context from cookies, or retry an unknown write.
            // Validated creation defaults are used only for confirmed missing context.
            const creationBody: NativeShopperContext = { ...initialContext, ...body };
            for (const key of ['assignmentQualifiers', 'customQualifiers'] as const) {
                if (initialContext?.[key] || body[key]) {
                    // Null means removal on PATCH. Persisting a null dictionary value on PUT
                    // can break dependent commerce reads; absence is the creation equivalent.
                    creationBody[key] = Object.fromEntries(
                        Object.entries({ ...initialContext?.[key], ...body[key] }).filter(([, value]) => value !== null)
                    );
                }
            }
            await client.createShopperContext({ params: { path: { usid } }, body: creationBody });
            // PUT returns 201 with no body. Verify the persisted result once on
            // creation; ordinary readiness and updates do not need native GET.
            const { data } = await client.getShopperContext({ params: { path: { usid } } });
            return data;
        }
    };
    return {
        /** Resolve once before dependent reads, including an expired/missing context. */
        resolve: () => (snapshot ??= patch({})),
        /** Store only native success; callers must publish their replicas afterwards. */
        update: async (body: NativeShopperContext, options?: { initialContext?: NativeShopperContext }) => {
            const result = await patch(body, options?.initialContext);
            snapshot = Promise.resolve(result);
            return result;
        },
    };
}

/** Server-owned handoff to the preview/consent/recalculation workstream. */
export type ConfirmedContextChangeRequired<T> = {
    success: false;
    code: 'STORE_CHANGE_CONFIRMATION_REQUIRED';
    current: T | null;
    candidate: T | null;
};
