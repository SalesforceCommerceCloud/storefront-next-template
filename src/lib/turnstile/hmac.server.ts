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
 * Server-only Turnstile HMAC helpers.
 *
 * Kept out of `utils.ts` so client components can import site-key / mode helpers
 * without pulling `node:crypto` into the browser bundle (Vite externalizes it and
 * throws on access, which freezes checkout on skeletons).
 */

import { createHash } from 'node:crypto';
import { getTurnstileSecretKey } from '@/lib/turnstile/utils';

/**
 * Derive a per-site HMAC key for binding the Turnstile session cookie to a specific email.
 * Uses domain separation so the derived key is independent of the raw Cloudflare secret.
 * Server-side only.
 */
export function getTurnstileHmacKey(siteKey: string): Buffer | null {
    const secret = getTurnstileSecretKey(siteKey);
    if (!secret) {
        return null;
    }

    return createHash('sha256').update(`sfnext-turnstile-cookie-binding:${secret}`).digest();
}
