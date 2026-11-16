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
import type { RouterContextProvider } from 'react-router';
import { type CommerceContextError, commerceContextErrorResponse } from '@/lib/auth/commerce-context.server';
import { buildUrlFromContext } from '@/lib/url.server';
import { routes } from '@/route-paths';

/** Keep route construction outside the shared error and invalidation primitives. */
export function commerceContextRecoveryResponse(
    error: CommerceContextError,
    context: Readonly<RouterContextProvider>
): Response {
    // Never replay an email token, IdP code or credential POST. Retry with a
    // clean GET so reconciliation uses the already committed identity.
    return commerceContextErrorResponse(error, {
        retryUrl: buildUrlFromContext(routes.login, context),
        logoutAction: buildUrlFromContext(routes.logout, context),
    });
}
