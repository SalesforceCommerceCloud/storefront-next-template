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
import { redirect } from 'react-router';
import { authRecoveryReturnContext, validateAuthRecoveryDestination } from '@/lib/auth/auth-recovery.server';
import { authStorageContext, AUTH_TOKEN_INVALID_ERROR } from '@/middlewares/auth.utils';
import type { Route } from './+types/resource.auth-recovery';

/** Fresh document request lets auth middleware publish recovered cookies before redirecting. */
export function loader({ context, request }: Route.LoaderArgs) {
    const url = new URL(request.url);
    const destination = validateAuthRecoveryDestination(url.searchParams.get('returnTo') ?? '/', request.url);
    context.set(authRecoveryReturnContext, destination);
    context.get(authStorageContext).set('error', AUTH_TOKEN_INVALID_ERROR);
    // Absolute same-origin URL prevents the router from adding basename a second time.
    return redirect(new URL(destination, url.origin).href, { headers: { 'Cache-Control': 'no-store' } });
}
