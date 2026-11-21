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
import { parseTrustedAgentToken, validateTrustedAgentLogin, type TrustedAgentResponse } from '@/scapi';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { getAppOrigin } from '@/lib/origin';
import { buildUrlFromContext } from '@/lib/url.server';
import type { SessionData } from '@/lib/api/types';
import { TrackingConsent } from '@/types/tracking-consent';
import {
    getTrustedAgentCookieCodec,
    readTrustedAgentCookie,
    serializeTrustedAgentCookie,
    TAOB_COOKIES,
    TAOB_FORM_COOKIE,
    TAOB_COMPLETION_COOKIE,
} from '@/lib/auth/trusted-agent/cookies.server';
import type { TrustedAgentLifecycle, TrustedAgentTransaction } from '@/lib/auth/trusted-agent/types';
import {
    restoreAuthGeneration,
    authGenerationContext,
    advanceAuthGeneration,
    persistAuthGeneration,
} from '@/lib/auth/auth-generation.server';

const text = z.string().min(1).max(512);
const sessionSchema = z.object({
    mode: z.enum(['active', 'reauth-required']),
    loginId: text,
    customerId: text,
    agentId: text,
    usid: text,
    contextVersion: text,
    tokenDigest: text,
    tokenExpiresAt: z.number().int().positive(),
    dwsid: text.optional(),
    authGeneration: text.optional(),
    requiresTargetConfirmation: z.boolean().optional(),
});
const transactionSchema = z.object({
    loginId: text,
    codeVerifier: text,
    redirectUri: z.string().url(),
    nonce: text,
    contextVersion: text,
    createdAt: z.number().int().positive(),
    expectedPriorContextVersion: text.nullable(),
    renewal: z.object({ usid: text, agentId: text }).optional(),
    returnUrl: z.string().max(2048).optional(),
    popup: z.boolean().optional(),
    authGeneration: text.optional(),
});
const launchSchema = z.object({ loginId: text, createdAt: z.number().int().positive() });
export const TAOB_TRANSACTION_WINDOW_MS = 5 * 60 * 1000;
export const TAOB_REAUTH_REQUIRED = 'TAOB_REAUTH_REQUIRED';

type TrustedAgentRequestState = {
    lifecycle: TrustedAgentLifecycle;
    lifecycleRoute: boolean;
    codec?: ReturnType<typeof getTrustedAgentCookieCodec>;
    dirty: boolean;
    clearOrdinary: boolean;
    invalidated?: boolean;
    /** Installed by auth middleware after all three request auth views are initialized. */
    publish?: () => void;
    previousContextVersion?: string | null;
};
export const trustedAgentContext = createContext<TrustedAgentRequestState | null>(null);

/** Exact paths, including site/locale/base prefixes and single-fetch URL conventions. */
export function isTrustedAgentLifecycleRequest(
    request: Request,
    context: Readonly<RouterContextProvider>,
    assisted = false
): boolean {
    const pathname = new URL(request.url).pathname.replace(/\.data$/, '').replace(/\/$/, '');
    return [
        '/login/agent',
        '/login/agent/authorize',
        '/login/agent/callback',
        '/login/agent/complete',
        ...(assisted ? ['/logout'] : []),
    ]
        .filter((path) => pathname.endsWith(path))
        .some((path) => pathname === buildUrlFromContext(path, context));
}

export function getTrustedAgentSettings(context: Readonly<RouterContextProvider>) {
    const feature = getConfig(context).features?.trustedAgent;
    if (!feature?.enabled || !feature.clientId || !feature.callbackUri)
        throw new Error('Trusted agent is not configured');
    const callbackPath =
        feature.callbackUri.startsWith('/') && !feature.callbackUri.startsWith('//')
            ? buildUrlFromContext(feature.callbackUri, context)
            : feature.callbackUri;
    const callback = new URL(callbackPath, getAppOrigin(context));
    if (
        callback.origin !== getAppOrigin(context) ||
        callback.search ||
        callback.hash ||
        callback.username ||
        callback.password
    )
        throw new Error('Trusted agent callback must use the public storefront origin');
    const siteId = context.get(siteContext)?.site.id;
    if (!siteId) throw new Error('Trusted agent requires site context');
    return {
        clientId: feature.clientId,
        redirectUri: callback.href,
        siteId,
        organizationId: getConfig(context).commerce.api.organizationId,
    };
}

async function tokenDigest(token: string): Promise<string> {
    return Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))).toString('base64url');
}

/** Authenticate cookie provenance before interpreting JWT identity. A launch hint has no auth effect. */
export async function restoreTrustedAgentState(
    request: Request,
    context: Readonly<RouterContextProvider>
): Promise<TrustedAgentRequestState> {
    const state: TrustedAgentRequestState = {
        lifecycle: { mode: 'none' },
        lifecycleRoute: false,
        dirty: false,
        clearOrdinary: false,
    };
    const generation = await restoreAuthGeneration(request, context);
    if (getConfig(context).features?.trustedAgent?.enabled) {
        getTrustedAgentSettings(context);
        state.codec = getTrustedAgentCookieCodec(context);
    }
    state.codec ??= generation.codec;
    let present = false;
    try {
        const at = readTrustedAgentCookie(request, TAOB_COOKIES.accessToken, context);
        const metadata = readTrustedAgentCookie(request, TAOB_COOKIES.session, context);
        const tx = readTrustedAgentCookie(request, TAOB_COOKIES.transaction, context);
        present =
            at !== undefined ||
            metadata !== undefined ||
            tx !== undefined ||
            generation.invalid ||
            generation.current?.mode === 'trusted-agent';
        if (
            generation.required &&
            generation.hadFence &&
            !generation.invalid &&
            generation.current?.mode !== 'trusted-agent'
        ) {
            // A newer ordinary/end boundary wins even if an older response rewrites assisted cookies.
            state.dirty = at !== undefined || metadata !== undefined || tx !== undefined;
            state.lifecycleRoute =
                Boolean(getConfig(context).features?.trustedAgent?.enabled || present) &&
                isTrustedAgentLifecycleRequest(request, context, present);
            context.set(trustedAgentContext, state);
            return state;
        }
        if (generation.invalid) throw new Error();
        if (generation.required && present && (!generation.hadFence || generation.current?.mode !== 'trusted-agent'))
            throw new Error();
        if (present) {
            state.lifecycle = { mode: 'blocked' };
            state.dirty = true;
            if (state.codec) {
                if (tx !== undefined) {
                    if (metadata !== 'blocked' || at !== undefined) throw new Error();
                    const transaction = transactionSchema.parse(await state.codec.open(tx, 'transaction'));
                    if (generation.required && transaction.authGeneration !== generation.current?.id) throw new Error();
                    if (
                        transaction.createdAt > Date.now() ||
                        Date.now() - transaction.createdAt > TAOB_TRANSACTION_WINDOW_MS ||
                        transaction.redirectUri !== getTrustedAgentSettings(context).redirectUri
                    )
                        throw new Error();
                    state.lifecycle = { mode: 'pending', transaction };
                } else if (metadata !== undefined) {
                    const session = sessionSchema.parse(await state.codec.open(metadata, 'session'));
                    if (generation.required && session.authGeneration !== generation.current?.id) throw new Error();
                    state.lifecycle = { mode: 'reauth-required', session: { ...session, mode: 'reauth-required' } };
                    if (at && session.mode === 'active') {
                        if ((await tokenDigest(at)) !== session.tokenDigest) throw new Error();
                        const identity = parseTrustedAgentToken(at, {
                            ...getTrustedAgentSettings(context),
                            loginId: session.loginId,
                            usid: session.usid,
                            agentId: session.agentId,
                        });
                        if (
                            identity.customerId !== session.customerId ||
                            identity.tokenExpiresAt !== session.tokenExpiresAt
                        )
                            throw new Error();
                        if (identity.tokenExpiresAt > Date.now()) {
                            state.lifecycle = { mode: 'active', session, accessToken: at };
                            state.dirty = false;
                        }
                    }
                    if (state.lifecycle.mode === 'reauth-required') state.dirty = true;
                }
            }
        }
    } catch {
        // Duplicate/tampered cookies can only block, never fall back to ordinary identity.
        state.lifecycle = { mode: 'blocked' };
        state.dirty = true;
    }
    state.lifecycleRoute =
        Boolean(getConfig(context).features?.trustedAgent?.enabled || present || state.lifecycle.mode !== 'none') &&
        isTrustedAgentLifecycleRequest(request, context, present || state.lifecycle.mode !== 'none');
    context.set(trustedAgentContext, state);
    return state;
}

export function getTrustedAgentSessionData(context: Readonly<RouterContextProvider>): SessionData {
    const lifecycle = context.get(trustedAgentContext)?.lifecycle;
    if (!lifecycle || lifecycle.mode === 'none' || lifecycle.mode === 'ended') return {};
    if (lifecycle.mode === 'pending' || lifecycle.mode === 'blocked')
        return {
            authMode: 'trusted-agent',
            trackingConsent: TrackingConsent.Declined,
            authGeneration: context.get(authGenerationContext)?.current?.id,
        };
    const { session } = lifecycle;
    return {
        authMode: 'trusted-agent',
        authGeneration: session.authGeneration,
        userType: 'registered',
        customerId: session.customerId,
        usid: session.usid,
        accessToken: lifecycle.mode === 'active' ? lifecycle.accessToken : undefined,
        accessTokenExpiry: session.tokenExpiresAt,
        dwsid: lifecycle.mode === 'active' ? session.dwsid : undefined,
        trackingConsent: TrackingConsent.Declined,
        actingAgent: {
            agentId: session.agentId,
            loginId: session.loginId,
            contextVersion: session.contextVersion,
            status: lifecycle.mode,
            tokenExpiresAt: session.tokenExpiresAt,
        },
    };
}

/** Called only with the dedicated server exchange result, never browser-submitted token data. */
export async function establishTrustedAgentState(
    context: Readonly<RouterContextProvider>,
    result: TrustedAgentResponse,
    contextVersion: string = crypto.randomUUID()
): Promise<void> {
    const state = context.get(trustedAgentContext);
    if (!state?.codec) throw new Error('Trusted agent state is not initialized');
    const generation = context.get(authGenerationContext);
    if (
        generation?.required &&
        (generation.current?.mode !== 'trusted-agent' ||
            (state.lifecycle.mode !== 'pending' && state.previousContextVersion === undefined))
    )
        advanceAuthGeneration(context, 'trusted-agent');
    const identity = parseTrustedAgentToken(result.accessToken, {
        ...getTrustedAgentSettings(context),
        loginId: result.identity.loginId,
        agentId: result.identity.agentId,
        usid: result.identity.usid,
    });
    if (identity.tokenExpiresAt <= Date.now() || identity.customerId !== result.identity.customerId)
        throw new Error('Invalid trusted agent exchange identity');
    const session = sessionSchema.parse({
        ...identity,
        contextVersion,
        mode: 'active',
        tokenDigest: await tokenDigest(result.accessToken),
        ...(result.dwsid && { dwsid: result.dwsid }),
        authGeneration: generation?.current?.id,
    });
    // Results are discarded on purpose: an oversize or malformed cookie must throw before `state.lifecycle` changes.
    await serializeTrustedAgentCookie(
        TAOB_COOKIES.accessToken,
        result.accessToken,
        context,
        new Date(session.tokenExpiresAt)
    );
    await serializeTrustedAgentCookie(TAOB_COOKIES.session, await state.codec.seal(session, 'session'), context);
    state.lifecycle = { mode: 'active', accessToken: result.accessToken, session };
    state.invalidated = false;
    state.dirty = true;
    state.clearOrdinary = true;
    state.publish?.();
}

export function setTrustedAgentTransaction(
    context: Readonly<RouterContextProvider>,
    transaction: Omit<TrustedAgentTransaction, 'expectedPriorContextVersion'>
): void {
    const state = context.get(trustedAgentContext);
    if (!state?.codec) throw new Error('Trusted agent state is not initialized');
    const previous = state.lifecycle;
    const generation = context.get(authGenerationContext);
    if (generation?.required && state.previousContextVersion === undefined)
        advanceAuthGeneration(context, 'trusted-agent');
    const expectedPriorContextVersion =
        state.previousContextVersion ??
        (previous.mode === 'active' || previous.mode === 'reauth-required' ? previous.session.contextVersion : null);
    state.lifecycle = {
        mode: 'pending',
        transaction: transactionSchema.parse({
            ...transaction,
            expectedPriorContextVersion,
            authGeneration: generation?.current?.id,
        }),
    };
    state.dirty = true;
    state.clearOrdinary = true;
    state.publish?.();
}

/** Clear the effective credential before starting a human authorization exchange. */
export function prepareTrustedAgentAuthorization(context: Readonly<RouterContextProvider>, renewal: boolean): void {
    const state = context.get(trustedAgentContext);
    if (!state?.codec || state.lifecycle.mode === 'pending')
        throw new Error('Trusted agent authorization is already pending');
    const previous = state.lifecycle;
    advanceAuthGeneration(context, 'trusted-agent');
    state.previousContextVersion =
        previous.mode === 'active' || previous.mode === 'reauth-required' ? previous.session.contextVersion : null;
    state.lifecycle =
        renewal && (previous.mode === 'active' || previous.mode === 'reauth-required')
            ? {
                  mode: 'reauth-required',
                  session: {
                      ...previous.session,
                      mode: 'reauth-required',
                      authGeneration: context.get(authGenerationContext)?.current?.id,
                  },
              }
            : { mode: 'blocked' };
    state.clearOrdinary = true;
    state.dirty = true;
    state.publish?.();
}

export function requireTrustedAgentReauthorization(context: Readonly<RouterContextProvider>): void {
    const state = context.get(trustedAgentContext);
    if (!state) return;
    state.invalidated = true;
    if (state.lifecycle.mode === 'active')
        state.lifecycle = { mode: 'reauth-required', session: { ...state.lifecycle.session, mode: 'reauth-required' } };
    else if (state.lifecycle.mode !== 'reauth-required') state.lifecycle = { mode: 'blocked' };
    state.dirty = true;
    state.publish?.();
}

/** Adopt only a backend-returned login for this same customer, then require a new explicit target confirmation. */
export function updateTrustedAgentLogin(
    context: Readonly<RouterContextProvider>,
    customerId: string,
    loginId: string
): void {
    const state = context.get(trustedAgentContext);
    if (!state?.lifecycle || (state.lifecycle.mode !== 'active' && state.lifecycle.mode !== 'reauth-required')) return;
    if (state.lifecycle.session.customerId !== customerId || state.lifecycle.session.loginId === loginId) return;
    validateTrustedAgentLogin(loginId);
    state.lifecycle = {
        mode: 'reauth-required',
        session: { ...state.lifecycle.session, mode: 'reauth-required', loginId, requiresTargetConfirmation: true },
    };
    state.dirty = true;
    state.invalidated = true;
    state.publish?.();
}

export function endTrustedAgentState(context: Readonly<RouterContextProvider>): void {
    const state = context.get(trustedAgentContext);
    if (!state) return;
    advanceAuthGeneration(context, 'ended');
    state.lifecycle = { mode: 'ended' };
    state.invalidated = false;
    state.dirty = true;
    state.clearOrdinary = true;
    state.publish?.();
}

/** Prepare all headers first: oversize state fails before any credential cookie is emitted. */
export async function persistTrustedAgentState(
    context: Readonly<RouterContextProvider>,
    response: Response
): Promise<void> {
    const state = context.get(trustedAgentContext);
    await persistAuthGeneration(context, response);
    if (!state?.dirty) return;
    const { lifecycle, codec } = state;
    const values = new Map<string, { value: string; expires?: Date }>();
    // The launch hint is a prefill with its own expiry. Clearing it on a blocked or pending write races the entry
    // route's 303 that just set it, so a relaunch carrying stale agent cookies would arrive with an empty login.
    // Once the session is active or ended the hint has done its job, and keeping it would prefill the previous shopper.
    const launchHintDone = lifecycle.mode === 'active' || lifecycle.mode === 'ended';
    for (const [key, name] of Object.entries(TAOB_COOKIES))
        if (key !== 'launch' || launchHintDone) values.set(name, { value: '', expires: new Date(0) });
    if (lifecycle.mode === 'ended')
        for (const name of [TAOB_FORM_COOKIE, TAOB_COMPLETION_COOKIE])
            values.set(name, { value: '', expires: new Date(0) });
    if (lifecycle.mode === 'active' || lifecycle.mode === 'reauth-required') {
        if (!codec) throw new Error('Trusted agent codec is unavailable');
        values.set(TAOB_COOKIES.session, { value: await codec.seal(lifecycle.session, 'session') });
        if (lifecycle.mode === 'active')
            values.set(TAOB_COOKIES.accessToken, {
                value: lifecycle.accessToken,
                expires: new Date(lifecycle.session.tokenExpiresAt),
            });
    } else if (lifecycle.mode === 'pending') {
        if (!codec) throw new Error('Trusted agent codec is unavailable');
        values.set(TAOB_COOKIES.session, { value: 'blocked' });
        values.set(TAOB_COOKIES.transaction, {
            value: await codec.seal(lifecycle.transaction, 'transaction'),
            expires: new Date(lifecycle.transaction.createdAt + TAOB_TRANSACTION_WINDOW_MS),
        });
    } else if (lifecycle.mode === 'blocked') {
        // An unauthenticated blocking marker confers no authority and outlives an orphaned access token.
        values.set(TAOB_COOKIES.session, { value: 'blocked' });
    }
    const headers = await Promise.all(
        [...values].map(([name, { value, expires }]) => serializeTrustedAgentCookie(name, value, context, expires))
    );
    headers.forEach((header) => response.headers.append('Set-Cookie', header));
    state.dirty = false;
}

/** Launch-prefill helpers deliberately do not alter lifecycle or effective auth. */
export async function readTrustedAgentLaunch(
    request: Request,
    context: Readonly<RouterContextProvider>
): Promise<string | undefined> {
    const codec = context.get(trustedAgentContext)?.codec;
    if (!codec) return undefined;
    try {
        const value = readTrustedAgentCookie(request, TAOB_COOKIES.launch, context);
        if (!value) return undefined;
        const launch = launchSchema.parse(await codec.open(value, 'launch'));
        return launch.createdAt <= Date.now() && Date.now() - launch.createdAt <= TAOB_TRANSACTION_WINDOW_MS
            ? launch.loginId
            : undefined;
    } catch {
        return undefined;
    }
}

export async function serializeTrustedAgentLaunch(
    loginId: string,
    context: Readonly<RouterContextProvider>
): Promise<string> {
    const codec = context.get(trustedAgentContext)?.codec;
    if (!codec) throw new Error('Trusted agent state is not initialized');
    const launch = launchSchema.parse({ loginId, createdAt: Date.now() });
    return serializeTrustedAgentCookie(
        TAOB_COOKIES.launch,
        await codec.seal(launch, 'launch'),
        context,
        new Date(launch.createdAt + TAOB_TRANSACTION_WINDOW_MS)
    );
}
