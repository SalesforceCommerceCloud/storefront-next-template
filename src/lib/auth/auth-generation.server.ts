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
import { createContext, type RouterContextProvider } from 'react-router';
import { z } from 'zod';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getCookieNameWithSiteId } from '@/lib/cookie-utils.server';
import {
    TAOB_COOKIES,
    getTrustedAgentCookieCodec,
    readTrustedAgentCookie,
    serializeTrustedAgentCookie,
} from '@/lib/auth/trusted-agent/cookies.server';
import type { SessionData } from '@/lib/api/types';
import { AUTH_CONTEXT_CHANGED, AUTH_CONTEXT_QUERY, AUTH_CONTEXT_HEADER } from '@/lib/auth/context-binding';
import { buildUrlFromContext } from '@/lib/url.server';

export const AUTH_FENCE_PREFIX = 'cc-auth-fence-';
export const AUTH_PROVENANCE_COOKIE = 'cc-auth-provenance';
// A fence must survive every ordinary refresh cookie, including browser/session restoration.
export const AUTH_RESPONSE_WINDOW_MS = 5 * 60 * 1000;
export const AUTH_FENCE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000 + AUTH_RESPONSE_WINDOW_MS;
const MAX_FENCES = 8;
const fenceSchema = z.object({
    id: z.string().min(1).max(128),
    sequence: z
        .number()
        .int()
        .nonnegative()
        .max(Number.MAX_SAFE_INTEGER - 1),
    mode: z.enum(['shopper', 'trusted-agent', 'ended']),
});
const provenanceSchema = z.object({
    generation: z.string(),
    sequence: z.number().int().nonnegative(),
    accessDigest: z.string().optional(),
    refreshDigest: z.string().optional(),
    codeVerifierDigest: z.string().optional(),
});
type Fence = z.infer<typeof fenceSchema>;
type Codec = ReturnType<typeof getTrustedAgentCookieCodec>;
type GenerationState = {
    initialized: true;
    startedAt: number;
    required: boolean;
    invalid: boolean;
    /** Unreadable fences were discarded because no assisted credential depends on them; the shopper continues as a fresh guest. */
    reset: boolean;
    hadFence: boolean;
    maximum: number;
    current?: Fence;
    created?: Fence;
    codec?: Codec;
    known: Array<{ name: string; fence?: Fence }>;
    provenance?: z.infer<typeof provenanceSchema>;
    clearOrdinary?: boolean;
    unrecoverable?: boolean;
};
export const authGenerationContext = createContext<GenerationState | null>(null);

/** Reject stale browser mutations before dispatch; lifecycle confirmation has its own protected form binding. */
export function authMutationFailure(
    request: Request,
    context: Readonly<RouterContextProvider>,
    lifecycle = false
): Response | undefined {
    const state = context.get(authGenerationContext);
    if (!state?.required || !state.hadFence) return;
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\.data$/, '').replace(/\/$/, '');
    const matches = (path: string) => pathname === buildUrlFromContext(path, context);
    if (lifecycle && !matches('/logout')) return;
    if (
        [
            '/resource/analytics-proxy',
            '/resource/turnstile-session',
            '/reset-password-callback',
            '/passwordless-login-callback',
            '/otp-callback',
        ].some(matches)
    )
        return;
    const values = url.searchParams.getAll(AUTH_CONTEXT_QUERY);
    const header = request.headers.get(AUTH_CONTEXT_HEADER);
    if (['GET', 'HEAD'].includes(request.method) && !header && !values.length) return;
    const received = header ?? values[0];
    if (
        !state.invalid &&
        received === state.current?.id &&
        values.length <= 1 &&
        (!header || !values.length || values[0] === header)
    )
        return;
    const recovery =
        state.current?.mode === 'trusted-agent'
            ? buildUrlFromContext('/login/agent', context)
            : buildUrlFromContext('/', context);
    return Response.json(
        {
            success: false,
            error: AUTH_CONTEXT_CHANGED,
            errors: ['The authentication context changed. Continue with the current session.'],
        },
        {
            status: 409,
            headers: {
                'Cache-Control': 'private, no-store',
                'Referrer-Policy': 'no-referrer',
                'x-sfnext-auth-error': AUTH_CONTEXT_CHANGED,
                'x-sfnext-auth-recovery-url': recovery,
            },
        }
    );
}

export async function credentialDigest(value: string): Promise<string> {
    return Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).toString('base64url');
}

/**
 * Restore non-identity lifecycle fences before reading either ordinary or assisted credentials.
 * Each transition has its own cookie name: an older response cannot overwrite a newer fence.
 * Equal-sequence ends dominate starts; ambiguous competing starts fail closed.
 */
export async function restoreAuthGeneration(
    request: Request,
    context: Readonly<RouterContextProvider>
): Promise<GenerationState> {
    const existing = context.get(authGenerationContext);
    if (existing?.initialized === true) return existing;
    const raw = request.headers.get('cookie') ?? '';
    const enabled = getConfig(context).features?.trustedAgent?.enabled ?? false;
    const potential = enabled || raw.includes(AUTH_FENCE_PREFIX) || raw.includes(AUTH_PROVENANCE_COOKIE);
    const suffix = potential ? getCookieNameWithSiteId('', context) : '';
    const cookieNames = raw.split(';').map((entry) => entry.trim().split('=')[0]);
    const names = potential
        ? cookieNames.filter((name) => name.startsWith(AUTH_FENCE_PREFIX) && name.endsWith(suffix))
        : [];
    const hasProvenance = potential && cookieNames.includes(getCookieNameWithSiteId(AUTH_PROVENANCE_COOKIE, context));
    const state: GenerationState = {
        initialized: true,
        startedAt: Date.now(),
        required: enabled || names.length > 0 || hasProvenance,
        invalid: false,
        reset: false,
        hadFence: false,
        maximum: 0,
        known: [],
    };
    context.set(authGenerationContext, state);
    if (!state.required) return state;
    try {
        // Checked before the codec exists: with the key ring removed the codec throws first, and damaged cookie
        // names must still stay blocked rather than fall into the unreadable-key reset.
        if (names.length > MAX_FENCES || new Set(names).size !== names.length) {
            state.unrecoverable = true;
            throw new Error();
        }
        const codec = getTrustedAgentCookieCodec(context);
        state.codec = codec;
        state.known = await Promise.all(
            names.map(async (fullName) => {
                const name = fullName.slice(0, -suffix.length);
                try {
                    const sealed = readFenceCookie(request, name, context, state);
                    if (!sealed) throw new Error();
                    const fence = fenceSchema.parse(await codec.open(sealed, 'auth-fence'));
                    if (name !== (await fenceName(fence))) throw new Error();
                    return { name, fence };
                } catch {
                    state.invalid = true;
                    return { name };
                }
            })
        );
        for (const { fence } of state.known) if (fence) state.maximum = Math.max(state.maximum, fence.sequence);
        state.hadFence = state.known.length > 0;
        const highest = state.known.flatMap(({ fence }) => (fence?.sequence === state.maximum ? [fence] : []));
        const ends = highest.filter(({ mode }) => mode === 'ended');
        if (ends.length) state.current = ends.sort((a, b) => a.id.localeCompare(b.id))[0];
        else if (highest.length === 1) state.current = highest[0];
        else if (highest.length > 1) throw new Error();
        const sealedProvenance = readFenceCookie(request, AUTH_PROVENANCE_COOKIE, context, state);
        if (sealedProvenance)
            state.provenance = provenanceSchema.parse(await state.codec.open(sealedProvenance, 'ordinary-provenance'));
        if (!state.current && sealedProvenance) throw new Error();
    } catch {
        state.invalid = true;
    }
    const everyFenceUnreadable = names.length > 0 && state.known.every(({ fence }) => !fence);
    if (
        state.invalid &&
        !state.unrecoverable &&
        everyFenceUnreadable &&
        (!enabled || !hasAssistedCredentialCookie(request, context))
    )
        resetUnreadableGeneration(state, names, suffix, enabled);
    return state;
}

/** A cookie that cannot even be read (duplicate or oversized) is tampering, not a key or configuration change. */
function readFenceCookie(
    request: Request,
    name: string,
    context: Readonly<RouterContextProvider>,
    state: GenerationState
): string | undefined {
    try {
        return readTrustedAgentCookie(request, name, context);
    } catch (error) {
        state.unrecoverable = true;
        throw error;
    }
}

function hasAssistedCredentialCookie(request: Request, context: Readonly<RouterContextProvider>): boolean {
    try {
        return [TAOB_COOKIES.accessToken, TAOB_COOKIES.session, TAOB_COOKIES.transaction].some(
            (name) => readTrustedAgentCookie(request, name, context) !== undefined
        );
    } catch {
        // A duplicate or oversized assisted cookie is tampering, not a configuration change.
        return true;
    }
}

/**
 * Fences that cannot ALL be opened (key removed from the ring, `clientId` changed, feature turned off) carry no
 * recoverable identity. A mix of readable and unreadable fences is partial damage that could hide a newer boundary,
 * so it stays blocked. With no assisted credential to protect, blocking would redirect every page to an agent
 * entry route that cannot help an ordinary shopper (and is a 404 when disabled). Discard them instead: the shopper
 * continues as a fresh guest, exactly as if they had cleared their cookies.
 * A disabled feature becomes inert, matching a deployment that never enabled it.
 */
function resetUnreadableGeneration(state: GenerationState, names: string[], suffix: string, enabled: boolean): void {
    state.invalid = false;
    state.reset = true;
    state.current = undefined;
    state.provenance = undefined;
    state.maximum = 0;
    state.known = names.map((fullName) => ({ name: fullName.slice(0, -suffix.length) }));
    state.hadFence = state.known.length > 0;
    if (!enabled) {
        state.required = false;
        state.codec = undefined;
    }
}

async function fenceName(fence: Fence): Promise<string> {
    const digest = await credentialDigest(fence.id);
    return `${AUTH_FENCE_PREFIX}${fence.sequence}-${digest.slice(0, 22)}`;
}

/** Only explicit auth transitions advance the generation; token refresh preserves its captured generation. */
export function advanceAuthGeneration(
    context: Readonly<RouterContextProvider>,
    mode: Fence['mode']
): string | undefined {
    const state = context.get(authGenerationContext);
    if (!state?.required) return undefined;
    if (!state.codec || state.unrecoverable) throw new Error('Authentication generation protection is unavailable');
    const fence: Fence = { id: crypto.randomUUID(), sequence: state.maximum + 1, mode };
    state.current = fence;
    state.created = fence;
    state.maximum = fence.sequence;
    state.invalid = false;
    state.provenance = undefined;
    return fence.id;
}

/** A bounded exchange/response window prevents a late predecessor from outliving its end fence. Not a session duration. */
export function assertAuthResponseFresh(context: Readonly<RouterContextProvider>): void {
    const state = context.get(authGenerationContext);
    if (state?.required && Date.now() - state.startedAt > AUTH_RESPONSE_WINDOW_MS)
        throw new Error('Authentication response expired');
}

/** Concurrent first requests, whether brand new or after logout, create the same fresh-guest generation, not competing identities. */
export async function prepareGuestGeneration(context: Readonly<RouterContextProvider>): Promise<boolean> {
    const state = context.get(authGenerationContext);
    if (!state?.required || (state.current && state.current.mode !== 'ended' && !state.provenance)) return false;
    const fence: Fence = state.current
        ? { id: await credentialDigest(`guest:${state.current.id}`), sequence: state.maximum + 1, mode: 'shopper' }
        : { id: await credentialDigest('guest:initial'), sequence: 0, mode: 'shopper' };
    state.current = fence;
    state.created = fence;
    state.maximum = fence.sequence;
    state.provenance = undefined;
    state.clearOrdinary = true;
    return true;
}

/** Missing/mismatched provenance prevents BOTH access-token reuse and refresh-token exchange. */
export async function canUseOrdinaryCredentials(
    request: Request,
    context: Readonly<RouterContextProvider>
): Promise<boolean> {
    const state = context.get(authGenerationContext);
    if (!state?.required) return true;
    if (state.invalid || state.current?.mode !== 'shopper' || state.provenance?.generation !== state.current.id)
        return false;
    try {
        const access = readTrustedAgentCookie(request, 'cc-at', context);
        const registered = readTrustedAgentCookie(request, 'cc-nx', context);
        const guest = readTrustedAgentCookie(request, 'cc-nx-g', context);
        const verifier = readTrustedAgentCookie(request, 'cc-cv', context);
        if (registered && guest) return false;
        const refresh = registered || guest;
        if (access && (await credentialDigest(access)) !== state.provenance.accessDigest) return false;
        if (refresh && (await credentialDigest(refresh)) !== state.provenance.refreshDigest) return false;
        if (verifier && (await credentialDigest(verifier)) !== state.provenance.codeVerifierDigest) return false;
        return Boolean(access || refresh);
    } catch {
        return false;
    }
}

/**
 * Compaction removes only older fence names observed on THIS request. It can never delete a
 * newer transition created while the request was in flight. Markers contain no credentials or identity.
 */
export async function persistAuthGeneration(
    context: Readonly<RouterContextProvider>,
    response: Response,
    ordinary?: SessionData,
    credentialsUpdated = false
): Promise<void> {
    const state = context.get(authGenerationContext);
    if (state?.reset && !state.required) {
        await expireDiscardedGeneration(context, response, state);
        return;
    }
    if (!state?.required || !state.codec || state.invalid || !state.current) return;
    if (state.created || credentialsUpdated) assertAuthResponseFresh(context);
    const expires = new Date(Date.now() + AUTH_FENCE_MAX_AGE_MS);
    if (state.created || credentialsUpdated) {
        response.headers.append(
            'Set-Cookie',
            await serializeTrustedAgentCookie(
                await fenceName(state.current),
                await state.codec.seal(state.current, 'auth-fence'),
                context,
                expires
            )
        );
    }
    const writtenName = state.created || credentialsUpdated ? await fenceName(state.current) : undefined;
    for (const known of state.known) {
        if (known.name === writtenName) continue;
        if (
            !known.fence ||
            known.fence.sequence < state.current.sequence ||
            (state.current.mode === 'ended' && known.fence.id !== state.current.id)
        ) {
            response.headers.append(
                'Set-Cookie',
                await serializeTrustedAgentCookie(known.name, '', context, new Date(0))
            );
        }
    }
    if (ordinary?.accessToken && credentialsUpdated && state.current.mode === 'shopper') {
        const [accessDigest, refreshDigest, codeVerifierDigest] = await Promise.all([
            credentialDigest(ordinary.accessToken),
            ordinary.refreshToken ? credentialDigest(ordinary.refreshToken) : undefined,
            ordinary.codeVerifier ? credentialDigest(ordinary.codeVerifier) : undefined,
        ]);
        const provenance = {
            generation: state.current.id,
            sequence: state.current.sequence,
            accessDigest,
            ...(refreshDigest && { refreshDigest }),
            ...(codeVerifierDigest && { codeVerifierDigest }),
        };
        response.headers.append(
            'Set-Cookie',
            await serializeTrustedAgentCookie(
                AUTH_PROVENANCE_COOKIE,
                await state.codec.seal(provenance, 'ordinary-provenance'),
                context,
                expires
            )
        );
    } else if ((state.created && state.current.mode !== 'shopper') || (state.reset && state.provenance === undefined)) {
        response.headers.append(
            'Set-Cookie',
            await serializeTrustedAgentCookie(AUTH_PROVENANCE_COOKIE, '', context, new Date(0))
        );
    }
}

async function expireDiscardedGeneration(
    context: Readonly<RouterContextProvider>,
    response: Response,
    state: GenerationState
): Promise<void> {
    const gone = new Date(0);
    for (const name of [...state.known.map((known) => known.name), AUTH_PROVENANCE_COOKIE])
        response.headers.append('Set-Cookie', await serializeTrustedAgentCookie(name, '', context, gone));
}
