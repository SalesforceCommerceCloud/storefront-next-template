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
import { data, redirectDocument, type RouterContextProvider } from 'react-router';
import { z } from 'zod';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { validateTrustedAgentLogin, createCodeVerifier } from '@/scapi';
import { createTrustedAgentClient } from '@/lib/api-clients.server';
import { getAppOrigin } from '@/lib/origin';
import { buildUrlFromContext, stripMrtBasePathFromUrl } from '@/lib/url.server';
import { getSafeReturnUrl } from '@/lib/utils';
import { routes } from '@/route-paths';
import type { TrustedAgentTransaction } from '@/lib/auth/trusted-agent/types';
import { authGenerationContext } from '@/lib/auth/auth-generation.server';
import { destroyAuth, updateTrustedAgentSession } from '@/middlewares/auth.server';
import { destroyBasket } from '@/middlewares/basket.server';
import {
    readTrustedAgentCookie,
    serializeTrustedAgentCookie,
    TAOB_FORM_COOKIE,
    TAOB_COMPLETION_COOKIE,
} from '@/lib/auth/trusted-agent/cookies.server';
import {
    trustedAgentContext,
    getTrustedAgentSettings,
    readTrustedAgentLaunch,
    serializeTrustedAgentLaunch,
    prepareTrustedAgentAuthorization,
    setTrustedAgentTransaction,
    requireTrustedAgentReauthorization,
    TAOB_TRANSACTION_WINDOW_MS,
} from '@/lib/auth/trusted-agent/session.server';

const formSchema = z.object({
    nonce: z.string().uuid(),
    createdAt: z.number(),
    contextVersion: z.string(),
    returnUrl: z.string().max(2048),
});
const completionSchema = z.object({
    correlation: z.string().uuid(),
    createdAt: z.number(),
    returnUrl: z.string().max(2048),
    popup: z.boolean(),
    status: z.enum(['success', 'error']),
    contextVersion: z.string().optional(),
});

export const trustedAgentPrivateHeaders = {
    'Cache-Control': 'private, no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
};

function fail(status: number, message: string): never {
    // oxlint-disable-next-line typescript/only-throw-error -- React Router consumes thrown HTTP responses from route helpers.
    throw new Response(message, { status, headers: trustedAgentPrivateHeaders });
}

function requireEnabled(context: Readonly<RouterContextProvider>) {
    const state = context.get(trustedAgentContext);
    const codec = state?.codec;
    if (!getConfig(context).features?.trustedAgent?.enabled || !state || !codec) fail(404, 'Not found');
    return Object.assign(state, { codec });
}

function currentVersion(context: Readonly<RouterContextProvider>): string {
    const lifecycle = context.get(trustedAgentContext)?.lifecycle;
    const generation = context.get(authGenerationContext)?.current?.id;
    if (generation) return generation;
    if (lifecycle?.mode === 'active' || lifecycle?.mode === 'reauth-required') return lifecycle.session.contextVersion;
    if (lifecycle?.mode === 'pending') return lifecycle.transaction.contextVersion;
    return lifecycle?.mode ?? 'none';
}

function isRecent(createdAt: number): boolean {
    return createdAt <= Date.now() && Date.now() - createdAt <= TAOB_TRANSACTION_WINDOW_MS;
}

function returnDestination(value: string | null, context: Readonly<RouterContextProvider>): string {
    const fallback = buildUrlFromContext(routes.home, context);
    const safe = getSafeReturnUrl(value);
    if (safe.length > 2048 || !safe.startsWith('/') || safe.startsWith('//') || safe.includes('\\')) return fallback;
    const url = new URL(safe, getAppOrigin(context));
    // `/.//host` normalizes to the protocol-relative path `//host`, which browsers treat as another origin.
    if (
        url.origin !== getAppOrigin(context) ||
        url.pathname.startsWith('//') ||
        /\/(login|logout|action|resource)(\/|$)/.test(url.pathname)
    )
        return fallback;
    for (const key of ['action', 'actionParams', 'loginId', 'code', 'code_verifier', 'token'])
        url.searchParams.delete(key);
    return buildUrlFromContext(stripMrtBasePathFromUrl(`${url.pathname}${url.search}`), context);
}

/** Capture launch context without changing authentication, then render a browser-bound confirmation form. */
export async function loadTrustedAgentEntry(request: Request, context: Readonly<RouterContextProvider>) {
    const state = requireEnabled(context);
    const url = new URL(request.url);
    const identifiers = url.searchParams.getAll('loginId');
    if (identifiers.length) {
        if (identifiers.length !== 1) fail(400, 'Invalid launch');
        try {
            validateTrustedAgentLogin(identifiers[0]);
        } catch {
            fail(400, 'Invalid launch');
        }
        const clean = new URL(buildUrlFromContext(routes.agentLogin, context), getAppOrigin(context));
        if (url.searchParams.has('returnUrl'))
            clean.searchParams.set('returnUrl', returnDestination(url.searchParams.get('returnUrl'), context));
        const response = redirectDocument(`${clean.pathname}${clean.search}`, {
            status: 303,
            headers: trustedAgentPrivateHeaders,
        });
        response.headers.append('Set-Cookie', await serializeTrustedAgentLaunch(identifiers[0], context));
        return response;
    }
    const lifecycle = state.lifecycle;
    const renew =
        lifecycle.mode === 'reauth-required' &&
        !lifecycle.session.requiresTargetConfirmation &&
        url.searchParams.get('mode') !== 'switch';
    const loginId =
        lifecycle.mode === 'reauth-required' && url.searchParams.get('mode') !== 'switch'
            ? lifecycle.session.loginId
            : ((await readTrustedAgentLaunch(request, context)) ?? '');
    const form = {
        nonce: crypto.randomUUID(),
        createdAt: Date.now(),
        contextVersion: currentVersion(context),
        returnUrl: returnDestination(url.searchParams.get('returnUrl'), context),
    };
    const headers = new Headers(trustedAgentPrivateHeaders);
    headers.append(
        'Set-Cookie',
        await serializeTrustedAgentCookie(
            TAOB_FORM_COOKIE,
            await state.codec.seal(form, 'form'),
            context,
            new Date(form.createdAt + TAOB_TRANSACTION_WINDOW_MS)
        )
    );
    return data(
        {
            loginId,
            nonce: form.nonce,
            action: buildUrlFromContext(routes.agentLogin, context),
            mode: renew ? ('renew' as const) : ('start' as const),
            pending: lifecycle.mode === 'pending',
            canEnd: lifecycle.mode === 'active' || lifecycle.mode === 'reauth-required',
            failed: url.searchParams.get('error') === 'authorization_failed',
            returnUrl: form.returnUrl,
        },
        { headers }
    );
}

/** Same-origin plus an authenticated, expiring form nonce binds the destructive confirmation to this browser. */
export async function submitTrustedAgentEntry(request: Request, context: Readonly<RouterContextProvider>) {
    const state = requireEnabled(context);
    // Every response carries `Referrer-Policy: no-referrer`, so browsers serialize this form's Origin as "null".
    // Sec-Fetch-Site is browser-set and unforgeable by page script, and is the only same-origin signal left.
    const sameOrigin =
        request.headers.get('origin') === getAppOrigin(context) ||
        request.headers.get('sec-fetch-site') === 'same-origin';
    if (request.method !== 'POST' || !sameOrigin) fail(403, 'Invalid confirmation');
    const rawBody = await request.text();
    if (rawBody.length > 8192) fail(400, 'Invalid confirmation');
    const body = new URLSearchParams(rawBody);
    let form: z.infer<typeof formSchema>;
    try {
        const sealed = readTrustedAgentCookie(request, TAOB_FORM_COOKIE, context);
        if (!sealed || body.getAll('nonce').length !== 1 || body.getAll('intent').length !== 1) throw new Error();
        form = formSchema.parse(await state.codec.open(sealed, 'form'));
        if (
            !isRecent(form.createdAt) ||
            form.nonce !== body.get('nonce') ||
            form.contextVersion !== currentVersion(context)
        )
            throw new Error();
    } catch {
        fail(403, 'Invalid confirmation');
    }
    const intent = body.get('intent');
    if (intent === 'end') {
        destroyAuth(context);
        destroyBasket(context);
        const response = redirectDocument(buildUrlFromContext(routes.home, context), {
            status: 303,
            headers: trustedAgentPrivateHeaders,
        });
        for (const name of [TAOB_FORM_COOKIE, TAOB_COMPLETION_COOKIE])
            response.headers.append('Set-Cookie', await serializeTrustedAgentCookie(name, '', context, new Date(0)));
        return response;
    }
    if (intent !== 'start' && intent !== 'renew') fail(400, 'Invalid confirmation');
    if (state.lifecycle.mode === 'pending') fail(409, 'Authorization already pending');
    const previous = state.lifecycle;
    const renewal =
        intent === 'renew' && (previous.mode === 'active' || previous.mode === 'reauth-required')
            ? previous.session
            : undefined;
    if (intent === 'renew' && (!renewal || renewal.requiresTargetConfirmation)) fail(409, 'Invalid renewal');
    const loginId = renewal?.loginId ?? (body.getAll('loginId').length === 1 ? (body.get('loginId') ?? '') : '');
    try {
        validateTrustedAgentLogin(loginId);
    } catch {
        return data({ error: 'invalid_login' as const }, { status: 400, headers: trustedAgentPrivateHeaders });
    }
    prepareTrustedAgentAuthorization(context, Boolean(renewal));
    destroyBasket(context);
    setTrustedAgentTransaction(context, {
        loginId,
        codeVerifier: createCodeVerifier(),
        redirectUri: getTrustedAgentSettings(context).redirectUri,
        nonce: form.nonce,
        contextVersion: crypto.randomUUID(),
        createdAt: Date.now(),
        returnUrl: form.returnUrl,
        popup: body.get('popup') === 'true',
        ...(renewal && { renewal: { agentId: renewal.agentId, usid: renewal.usid } }),
    });
    return redirectDocument(buildUrlFromContext(routes.agentAuthorize, context), {
        status: 303,
        headers: trustedAgentPrivateHeaders,
    });
}

/** The pending boundary is already in browser cookies before any external SLAS authorization request starts. */
export async function authorizeTrustedAgentTransaction(request: Request, context: Readonly<RouterContextProvider>) {
    if (request.method !== 'GET') fail(405, 'Method not allowed');
    const state = requireEnabled(context);
    if (state.lifecycle.mode !== 'pending')
        return redirectDocument(buildUrlFromContext(routes.agentLogin, context), {
            status: 303,
            headers: trustedAgentPrivateHeaders,
        });
    const transaction = state.lifecycle.transaction;
    try {
        if (!isRecent(transaction.createdAt)) throw new Error();
        const authorization = await createTrustedAgentClient(context).authorizeRegistered({
            loginId: transaction.loginId,
            codeVerifier: transaction.codeVerifier,
        });
        if (!isRecent(transaction.createdAt)) throw new Error();
        return redirectDocument(authorization.authorizationUrl, { status: 303, headers: trustedAgentPrivateHeaders });
    } catch {
        requireTrustedAgentReauthorization(context);
        state.invalidated = false;
        if (transaction.popup) return redirectToCompletion(context, transaction, 'error');
        return redirectDocument(`${buildUrlFromContext(routes.agentLogin, context)}?error=authorization_failed`, {
            status: 303,
            headers: trustedAgentPrivateHeaders,
        });
    }
}

/** The completion page is what tells a popup's opener the outcome, so every popup-ending path must go through it. */
async function redirectToCompletion(
    context: Readonly<RouterContextProvider>,
    transaction: TrustedAgentTransaction,
    status: 'success' | 'error',
    contextVersion?: string
) {
    const state = requireEnabled(context);
    const completion = {
        correlation: transaction.nonce,
        createdAt: Date.now(),
        returnUrl: transaction.returnUrl ?? buildUrlFromContext(routes.home, context),
        popup: transaction.popup ?? false,
        status,
        contextVersion,
    };
    const response = redirectDocument(buildUrlFromContext(routes.agentComplete, context), {
        status: 303,
        headers: trustedAgentPrivateHeaders,
    });
    response.headers.append(
        'Set-Cookie',
        await serializeTrustedAgentCookie(
            TAOB_COMPLETION_COOKIE,
            await state.codec.seal(completion, 'completion'),
            context,
            new Date(completion.createdAt + TAOB_TRANSACTION_WINDOW_MS)
        )
    );
    return response;
}

/** Exchanges only the protected transaction's verifier/target. No credential reaches a route component or opener. */
export async function completeTrustedAgentAuthorization(request: Request, context: Readonly<RouterContextProvider>) {
    const state = requireEnabled(context);
    if (state.lifecycle.mode !== 'pending')
        return redirectDocument(`${buildUrlFromContext(routes.agentLogin, context)}?error=authorization_failed`, {
            status: 303,
            headers: trustedAgentPrivateHeaders,
        });
    const transaction = state.lifecycle.transaction;
    const url = new URL(request.url);
    let status: 'success' | 'error' = 'error';
    let contextVersion: string | undefined;
    try {
        const codes = url.searchParams.getAll('code');
        const states = url.searchParams.getAll('state');
        if (
            !isRecent(transaction.createdAt) ||
            codes.length !== 1 ||
            !codes[0] ||
            codes[0].length > 2048 ||
            states.length > 1 ||
            url.searchParams.has('error')
        )
            throw new Error();
        const result = await createTrustedAgentClient(context).exchangeCode({
            loginId: transaction.loginId,
            code: codes[0],
            codeVerifier: transaction.codeVerifier,
            ...(states.length && { state: states[0] }),
            ...(transaction.renewal && { usid: transaction.renewal.usid, agentId: transaction.renewal.agentId }),
        });
        if (!isRecent(transaction.createdAt)) throw new Error();
        if (state.lifecycle.mode !== 'pending' || state.lifecycle.transaction.nonce !== transaction.nonce)
            throw new Error();
        contextVersion = transaction.contextVersion;
        await updateTrustedAgentSession(context, result, contextVersion);
        status = 'success';
    } catch {
        requireTrustedAgentReauthorization(context);
        // An expected lifecycle failure has its own clean completion response.
        state.invalidated = false;
    }
    return redirectToCompletion(context, transaction, status, contextVersion);
}

export async function loadTrustedAgentCompletion(request: Request, context: Readonly<RouterContextProvider>) {
    const state = requireEnabled(context);
    try {
        const sealed = readTrustedAgentCookie(request, TAOB_COMPLETION_COOKIE, context);
        if (!sealed) throw new Error();
        const completion = completionSchema.parse(await state.codec.open(sealed, 'completion'));
        if (!isRecent(completion.createdAt)) throw new Error();
        if (
            completion.status === 'success' &&
            (state.lifecycle.mode !== 'active' || state.lifecycle.session.contextVersion !== completion.contextVersion)
        )
            throw new Error();
        const destination =
            completion.status === 'success'
                ? completion.returnUrl
                : `${buildUrlFromContext(routes.agentLogin, context)}?error=authorization_failed`;
        if (!completion.popup)
            return redirectDocument(destination, { status: 303, headers: trustedAgentPrivateHeaders });
        return data(
            { correlation: completion.correlation, status: completion.status, destination },
            { headers: trustedAgentPrivateHeaders }
        );
    } catch {
        return redirectDocument(buildUrlFromContext(routes.agentLogin, context), {
            status: 303,
            headers: trustedAgentPrivateHeaders,
        });
    }
}
