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
/** @sfdc-extension-file SFDC_EXT_STORE_LOCATOR */
import { getTrustedProxyPublicOrigin } from '@/lib/origin';

/**
 * Same-origin check pinned to the trusted public origin; unlike the shared helper it ignores spoofable forwarded hosts outside production.
 * When no trusted proxy origin is configured it falls back to the request URL's own origin.
 */
export function isTrustedSameOrigin(request: Request): boolean {
    try {
        const requestOrigin = new URL(request.url).origin;
        const trusted = new URL(getTrustedProxyPublicOrigin(request) ?? request.url).origin;
        const source = request.headers.get('origin') ?? request.headers.get('referer');
        if (!source) return false;
        const sourceOrigin = new URL(source).origin;
        // The request's own origin is also accepted: Origin/Referer are browser-set, so this only admits same-origin page requests.
        return sourceOrigin === trusted || sourceOrigin === requestOrigin;
    } catch {
        return false;
    }
}

export function isValidStoreId(id: unknown): id is string {
    return (
        typeof id === 'string' &&
        !!id.trim() &&
        id === id.trim() &&
        id.length <= 256 &&
        !/[,{}[\]]/.test(id) &&
        !Array.from(id).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    );
}
