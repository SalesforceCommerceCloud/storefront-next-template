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

type ResponseDetails = {
    method: string;
    url: string;
};

const CART_MUTATION_OPERATIONS = new Map([
    ['cart-item-add', 'POST'],
    ['cart-set-add', 'POST'],
    ['cart-bundle-add', 'POST'],
    ['cart-item-update', 'PATCH'],
    ['cart-bundle-update', 'PATCH'],
]);

export function isCartMutationResponse({ method, url }: ResponseDetails): boolean {
    try {
        const segments = new URL(url).pathname.split('/').filter(Boolean);
        const actionIndex = segments.lastIndexOf('action');
        if (actionIndex !== segments.length - 2) {
            return false;
        }

        // React Router appends `.data` to client-side action requests. The action
        // itself remains the preceding route name, regardless of a site prefix.
        const actionName = segments.at(-1)?.replace(/\.data$/, '');
        return actionName !== undefined && CART_MUTATION_OPERATIONS.get(actionName) === method;
    } catch {
        return false;
    }
}
