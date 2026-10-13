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
import { getAppOrigin } from '@/lib/origin';
import { buildCanonicalUrl } from '@/utils/canonical-url';

/**
 * The one canonical page URL every crawler-visible surface must agree on.
 *
 * Resolves the public origin via `getAppOrigin` (the forwarded host on MRT,
 * never the internal Lambda URL that `requestUrl.origin` carries) and applies
 * the canonical normalization (allowlisted params only, sorted, no trailing
 * slash). The canonical `<link>`, `og:url`, JSON-LD `url`, and pagination
 * `rel=prev/next` all build from this single value so search and social signals
 * point at the same preferred URL.
 */
export function buildSeoPageUrl(context: Readonly<RouterContextProvider>, requestUrl: URL): string {
    return buildCanonicalUrl(getAppOrigin(context), requestUrl.pathname, requestUrl.search);
}
