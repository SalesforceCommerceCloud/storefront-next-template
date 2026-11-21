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
import { z } from 'zod';
import { createProtectedStateCodec } from '@/scapi';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { createCookie, getCookieConfig, getCookieNameWithSiteId } from '@/lib/cookie-utils.server';
import { getAppOrigin } from '@/lib/origin';

export const TAOB_COOKIES = {
    accessToken: 'cc-taob-at',
    session: 'cc-taob-session',
    transaction: 'cc-taob-tx',
    launch: 'cc-taob-launch',
} as const;
export const TAOB_FORM_COOKIE = 'cc-taob-form';
export const TAOB_COMPLETION_COOKIE = 'cc-taob-complete';

const keyRingSchema = z
    .array(z.object({ id: z.string().min(1).max(64), key: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }))
    .min(1)
    .max(5);

/**
 * Load the server-only key ring. First key encrypts, all listed keys decrypt.
 * @env {string} [TAOB_COOKIE_KEYS] Required when trustedAgent is enabled or protected auth cookies remain.
 * JSON array of key IDs and base64url-encoded 32-byte keys; e.g. `[{"id":"2026-10","key":"<43 base64url characters>"}]`.
 */
export function getTrustedAgentCookieCodec(context: Readonly<RouterContextProvider>) {
    try {
        const keys = keyRingSchema.parse(JSON.parse(process.env.TAOB_COOKIE_KEYS ?? 'null'));
        const codec = createProtectedStateCodec(
            keys.map(({ id, key }) => ({ id, key: new Uint8Array(Buffer.from(key, 'base64url')) }))
        );
        const siteId = context.get(siteContext)?.site.id;
        if (!siteId) throw new Error();
        const binding = { siteId, origin: getAppOrigin(context) };
        const config = getConfig(context);
        const scope = JSON.stringify([config.commerce.api.organizationId, config.features?.trustedAgent?.clientId]);
        return {
            seal: (value: unknown, purpose: string) =>
                codec.seal(value, { ...binding, purpose: `${scope}:${purpose}` }),
            open: (value: string, purpose: string) => codec.open(value, { ...binding, purpose: `${scope}:${purpose}` }),
        };
    } catch {
        throw new Error('Trusted agent requires a valid TAOB_COOKIE_KEYS key ring');
    }
}

/** Read raw values without collapsing duplicate names (including empty duplicate values). */
export function readTrustedAgentCookie(
    request: Request,
    name: string,
    context: Readonly<RouterContextProvider>
): string | undefined {
    const fullName = getCookieNameWithSiteId(name, context);
    const matches = (request.headers.get('cookie') ?? '')
        .split(';')
        .map((entry) => entry.trim())
        .filter((entry) => entry.indexOf('=') !== -1 && entry.slice(0, entry.indexOf('=')) === fullName);
    if (matches.length > 1) throw new Error('Duplicate trusted agent cookie');
    if (matches[0] && Buffer.byteLength(matches[0], 'utf8') > 4096) throw new Error('Oversized trusted agent cookie');
    return matches.length ? matches[0].slice(fullName.length + 1) : undefined;
}

/** Configured domain/path are used for both writes and deletion; HTTPS always sets Secure. */
export async function serializeTrustedAgentCookie(
    name: string,
    value: string,
    context: Readonly<RouterContextProvider>,
    expires?: Date
): Promise<string> {
    const options = getCookieConfig(
        {
            httpOnly: true,
            sameSite: 'lax' as const,
            secure: new URL(getAppOrigin(context)).protocol === 'https:',
            expires,
            maxAge: undefined,
        },
        context
    );
    const serialized = await createCookie<string>(name, options, context).serialize(value, options);
    if (
        Buffer.byteLength(serialized, 'utf8') > 4096 ||
        [...value].some(
            (character) => character === ';' || character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127
        )
    )
        throw new Error('Trusted agent cookie exceeds supported size or format');
    return serialized;
}
