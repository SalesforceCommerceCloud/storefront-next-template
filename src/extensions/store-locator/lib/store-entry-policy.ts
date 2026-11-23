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

const shoppingRoutes = new Set([
    '_app._index',
    '_app.c.$',
    '_app.p.$',
    '_app.search',
    '_app.cart',
    '_checkout.checkout',
]);

/** Merchant route policy. Match route IDs so site prefixes and configurable SEO URLs do not change entry behavior. */
export function isStoreEntryRoute(matches: ReadonlyArray<{ id: string; handle?: unknown }>): boolean {
    for (let index = matches.length - 1; index >= 0; index--) {
        const handle = matches[index].handle;
        if (handle && typeof handle === 'object' && 'storeEntryRequired' in handle) {
            if (typeof handle.storeEntryRequired === 'boolean') return handle.storeEntryRequired;
        }
    }
    return matches.some(({ id }) =>
        shoppingRoutes.has(
            id
                .split('/')
                .at(-1)
                ?.replace(/--root-duplicate$/, '') ?? ''
        )
    );
}
