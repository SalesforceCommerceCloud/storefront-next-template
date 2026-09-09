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
 * SLAS server-to-server reset-password callback resource route.
 *
 * Registered at /reset-password-callback (no site/locale prefix) so that a single
 * Callback URL entry in SLAS Admin covers all sites and locales. The site-context
 * middleware resolves to the default site/locale when the URL has no prefix.
 *
 * This route is not reachable by end users — only SLAS will POST to it.
 */
export { handleResetPasswordCallback as action } from '@/lib/api/auth/reset-password.server';
