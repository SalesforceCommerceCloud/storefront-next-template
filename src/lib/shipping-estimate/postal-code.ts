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

const POSTAL_CODE_SANITY_RE = /^[A-Z0-9](?:[A-Z0-9 -]{0,10}[A-Z0-9])?$/i;

export function normalizePostalCode(value: string | null | undefined): string | null {
    const normalized = value?.trim();
    return normalized && normalized.length <= 12 && POSTAL_CODE_SANITY_RE.test(normalized) ? normalized : null;
}
