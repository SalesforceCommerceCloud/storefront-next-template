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
export const AUTH_CONTEXT_QUERY = '__authContext';
export const AUTH_CONTEXT_HEADER = 'x-sfnext-auth-context';
export const AUTH_CONTEXT_CHANGED = 'AUTH_CONTEXT_CHANGED';

/** Non-secret rendering-context binding. It confers no permission and never contains shopper identity. */
export function bindAuthContext(action: string, version?: string): string {
    if (!version) return action;
    const hashIndex = action.indexOf('#');
    const withoutHash = hashIndex === -1 ? action : action.slice(0, hashIndex);
    const hash = hashIndex === -1 ? '' : action.slice(hashIndex + 1);
    const question = withoutHash.indexOf('?');
    const path = question === -1 ? withoutHash : withoutHash.slice(0, question);
    const params = new URLSearchParams(question === -1 ? '' : withoutHash.slice(question + 1));
    params.set(AUTH_CONTEXT_QUERY, version);
    return `${path}?${params}${hash ? `#${hash}` : ''}`;
}
