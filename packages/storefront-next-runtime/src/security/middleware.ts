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
import { type MiddlewareFunction } from 'react-router';
import { isRemote } from '../env';
import { isDesignModeActive, isPreviewModeActive } from '../design/modeDetection.js';
import { defaultSecurityHeaders, pageDesignerFrameAncestors } from './defaults.js';
import { generateNonce, securityContext } from './nonce.js';
import { parseSecurityConfig } from './schema.js';
import { serializeCsp, serializeHsts, serializePermissionsPolicy } from './serialize.js';
import type { CspDirectives, HstsConfig, ResolvedSecurityConfig, SecurityConfig } from './types.js';
import { resolveCsp } from './contributors/resolve-csp.js';
import type { CspContributor } from './contributors/types.js';

/**
 * Merge customer config with SDK defaults. Per-directive replace: any
 * directive the customer sets fully replaces the SDK default for that key
 * (object spread semantics).
 *
 * Narrows defaults via a runtime check rather than `as Required<...>` casts,
 * so a future change that sets `defaults.csp = false` or `defaults.hsts = false`
 * is caught here instead of producing `max-age=undefined` at the wire.
 */
function resolve(input: SecurityConfig): ResolvedSecurityConfig {
    const defaultsCsp = defaultSecurityHeaders.csp === false ? null : defaultSecurityHeaders.csp;
    const defaultsHsts: Required<HstsConfig> | null =
        defaultSecurityHeaders.hsts === false ? null : defaultSecurityHeaders.hsts;

    return {
        enabled: input.enabled ?? defaultSecurityHeaders.enabled,
        csp:
            input.csp === false
                ? false
                : {
                      directives: {
                          ...(defaultsCsp?.directives ?? {}),
                          ...(input.csp?.directives ?? {}),
                      },
                      reportOnly: input.csp?.reportOnly ?? false,
                  },
        hsts:
            input.hsts === false
                ? false
                : input.hsts === undefined
                  ? (defaultsHsts ?? false)
                  : { ...(defaultsHsts ?? { maxAge: 0, includeSubDomains: false, preload: false }), ...input.hsts },
        frameOptions: input.frameOptions ?? defaultSecurityHeaders.frameOptions,
        contentTypeOptions: input.contentTypeOptions ?? defaultSecurityHeaders.contentTypeOptions,
        referrerPolicy: input.referrerPolicy ?? defaultSecurityHeaders.referrerPolicy,
        permissionsPolicy: input.permissionsPolicy ?? defaultSecurityHeaders.permissionsPolicy,
    };
}

/**
 * Boot-time warnings. Logged once per server start when potentially
 * unsafe configurations are active.
 */
function warnIfUnsafe(resolved: ResolvedSecurityConfig): void {
    if (!resolved.enabled) {
        // oxlint-disable-next-line no-console
        console.warn('[security] All security headers disabled via config. This is not recommended for production.');
        return;
    }
    if (resolved.csp === false) {
        // oxlint-disable-next-line no-console
        console.warn('[security] CSP disabled via config. Other headers still applied.');
    } else if (resolved.csp.reportOnly) {
        // oxlint-disable-next-line no-console
        console.warn(
            '[security] CSP is in report-only mode. This is intended for migration only. Set csp.reportOnly to false before going to production.'
        );
    }
    if (resolved.csp !== false) {
        const scriptSrc = resolved.csp.directives['script-src'];
        if (Array.isArray(scriptSrc) && !scriptSrc.includes("'self'")) {
            // oxlint-disable-next-line no-console
            console.warn(
                "[security] CSP script-src does not include 'self'. The inline window.__APP_CONFIG__ script may fail to execute."
            );
        }
    }
}

/**
 * Create the React Router middleware that applies default security
 * response headers.
 *
 * - Validates customer config via zod at factory call (boot). Throws on
 *   invalid directive names with a clear message.
 * - Generates a fresh CSP nonce per request (16 bytes / 24 base64 chars).
 *   Sets it on `securityContext` for `getSecurityNonce()` consumers.
 * - Merges customer directives over SDK defaults (per-directive replace).
 * - HSTS is suppressed locally — emitted only when running on MRT
 *   (BUNDLE_ID set and not 'local').
 *
 * @param input - Customer security config from `config.server.ts`. Any
 * field omitted falls back to the SDK default.
 * @param contributors - Boot-static CSP contributors to fold into the
 * directives after env-adjust. Contributors' origins are validated and
 * merged at boot, then folded after #2016 local-dev adjustments.
 *
 * Reads (at boot, once):
 * - `process.env.BUNDLE_ID` — when set and not 'local', emit HSTS.
 *
 * @example
 * ```ts
 * const mw = createSecurityHeadersMiddleware(config.security, contributors);
 * // register in root.tsx middleware chain before appConfigMiddleware
 * ```
 */
export function createSecurityHeadersMiddleware(
    input: SecurityConfig = {},
    contributors: readonly CspContributor[] = []
): MiddlewareFunction<Response> {
    parseSecurityConfig(input); // throws on invalid input
    const resolved = resolve(input);
    warnIfUnsafe(resolved);

    const remote = isRemote();

    // Local-dev-only CSP adjustments, gated on !remote so the deployed (Managed
    // Runtime) CSP stays byte-for-byte identical. These apply only on `pnpm dev`,
    // which serves plain HTTP over loopback.
    if (!remote && resolved.csp !== false) {
        // (1) Allow Vite's HMR websocket. Vite serves HMR over a WebSocket (e.g.
        // ws://localhost:24678); the production connect-src has no ws: source, so
        // without this the browser blocks the socket and live reload silently dies.
        // Port is wildcarded because Vite's HMR port is configurable / auto-increments
        // on collision. Only `ws://` loopback is added: the local dev server is plain
        // HTTP, and the workspace HMR path uses `wss://` to an EXTERNAL host (not
        // localhost), which the deployed CSP already covers.
        const connectSrc = resolved.csp.directives['connect-src'];
        if (Array.isArray(connectSrc)) {
            const devSocketSources = ['ws://localhost:*', 'ws://127.0.0.1:*'];
            resolved.csp.directives['connect-src'] = [
                ...connectSrc,
                ...devSocketSources.filter((s) => !connectSrc.includes(s)),
            ];
        }

        // (2) Drop `upgrade-insecure-requests`. It tells the browser to rewrite every
        // http subresource to https WITHOUT changing a non-default port, so
        // http://localhost:5173/x.css becomes https://localhost:5173/x.css — which has
        // no TLS listener locally. Chrome/Firefox skip the upgrade for loopback (a
        // non-standard leniency); Safari/WebKit follows the spec literally, so every
        // CSS/JS request fails with a TLS error. Loopback traffic is not network-
        // observable, so there is nothing to upgrade-protect locally — suppressing it
        // costs no security (same rationale as suppressing HSTS above). Production
        // (remote) keeps the directive. `delete` only touches this per-instance
        // directives object, never the shared module default.
        delete resolved.csp.directives['upgrade-insecure-requests'];
    }

    // Fold boot-static CSP contributors AFTER the #2016 local-dev adjustments.
    // Contributors are validated and merged by resolveCsp; only active boot-static
    // origins are folded here. This happens after env-adjust so the adjustments
    // (ws:// sources, upgrade-insecure-requests removal) are preserved and the
    // contributors see the final env-adjusted directives.
    if (contributors.length > 0 && resolved.csp !== false) {
        resolved.csp.directives = resolveCsp({
            baseDirectives: resolved.csp.directives,
            contributors,
        }).staticDirectives;
    }

    // Pre-compute everything that doesn't depend on the per-request nonce.
    // The CSP serializer iterates ~11 directives + does string joins; doing
    // that once at boot instead of per-request saves ~10-25µs per response.
    const staticHsts = remote && resolved.hsts !== false ? serializeHsts(resolved.hsts) : null;
    const permissionsHeader =
        resolved.permissionsPolicy === false ? null : serializePermissionsPolicy(resolved.permissionsPolicy);
    const cspHeaderName =
        resolved.csp !== false && resolved.csp.reportOnly
            ? 'Content-Security-Policy-Report-Only'
            : 'Content-Security-Policy';

    // Pre-build the static CSP body with everything except script-src.
    // Per request we append `; script-src <baseScriptSrc> 'nonce-<value>'`.
    //
    // We pre-build TWO variants: the default and a Page-Designer-relaxed
    // variant where `frame-ancestors` is extended to allow Business Manager
    // / Page Designer host families. The relaxed variant is selected only on
    // requests with `?mode=EDIT` or `?mode=PREVIEW`. Normal shopper traffic
    // continues to ship the default `frame-ancestors 'self'`.
    let staticCspBody: string | null = null;
    let staticCspBodyForPageDesigner: string | null = null;
    let baseScriptSrc = '';
    if (resolved.csp !== false) {
        const { 'script-src': scriptSrc, ...rest } = resolved.csp.directives;
        staticCspBody = serializeCsp(rest as CspDirectives);
        baseScriptSrc = (scriptSrc ?? []).join(' ');

        // Only build the relaxed variant if the customer hasn't already
        // expanded frame-ancestors themselves. If they have, respect their
        // override and keep behavior consistent across requests.
        const customerFrameAncestors = rest['frame-ancestors'] ?? [];
        const customerExpandedFrameAncestors = customerFrameAncestors.some((src) => src !== "'self'");
        if (!customerExpandedFrameAncestors) {
            staticCspBodyForPageDesigner = serializeCsp({
                ...(rest as CspDirectives),
                'frame-ancestors': [...customerFrameAncestors, ...pageDesignerFrameAncestors],
            });
        }
    }

    /**
     * Apply the resolved security headers to a response. Pulled into a helper
     * so we can run it on the success path AND on a thrown Response (RR
     * loaders/actions throw `Response` for 404/redirect/etc.). Without this,
     * a 404 error response would ship without security headers.
     */
    const applyHeaders = (
        response: Response,
        nonce: string | null,
        cspBody: string | null,
        isEmbeddable: boolean
    ): Response => {
        if (cspBody !== null && nonce !== null) {
            const scriptSrcClause =
                baseScriptSrc.length > 0
                    ? `script-src ${baseScriptSrc} 'nonce-${nonce}'`
                    : `script-src 'nonce-${nonce}'`;
            const csp = cspBody.length > 0 ? `${cspBody}; ${scriptSrcClause}` : scriptSrcClause;
            response.headers.set(cspHeaderName, csp);
        }
        if (staticHsts !== null) response.headers.set('Strict-Transport-Security', staticHsts);
        // X-Frame-Options has no host-list form. On embeddable requests, suppress
        // it and let the per-request `frame-ancestors` govern embedding instead.
        if (resolved.frameOptions !== false && !isEmbeddable)
            response.headers.set('X-Frame-Options', resolved.frameOptions);
        if (resolved.contentTypeOptions !== false)
            response.headers.set('X-Content-Type-Options', resolved.contentTypeOptions);
        if (resolved.referrerPolicy !== false) response.headers.set('Referrer-Policy', resolved.referrerPolicy);
        if (permissionsHeader !== null) response.headers.set('Permissions-Policy', permissionsHeader);
        return response;
    };

    return async (args, next) => {
        if (!resolved.enabled) return next();

        // Generate nonce + put on context BEFORE next() so render can read it.
        const nonce = resolved.csp === false ? null : generateNonce();
        if (nonce !== null) args.context.set(securityContext, { nonce });

        // Detect Page Designer EDIT / Business Manager PREVIEW requests so we
        // can ship a relaxed `frame-ancestors` only for those. Falls back to
        // the strict default for normal shopper traffic.
        const isEmbeddable =
            staticCspBodyForPageDesigner !== null &&
            (isDesignModeActive(args.request) || isPreviewModeActive(args.request));
        const cspBody = isEmbeddable ? staticCspBodyForPageDesigner : staticCspBody;

        try {
            return applyHeaders(await next(), nonce, cspBody, isEmbeddable);
        } catch (err) {
            // RR loaders/actions throw `Response` instances (e.g. 404, redirect).
            // Apply security headers to the thrown response and re-throw so RR
            // continues to handle it (e.g. render the error boundary).
            if (err instanceof Response) {
                // RR's contract: loaders/actions throw `Response` for 404/redirect.
                // oxlint-disable-next-line @typescript-eslint/only-throw-error
                throw applyHeaders(err, nonce, cspBody, isEmbeddable);
            }
            // For non-Response errors (unexpected exceptions), RR synthesizes a
            // 500 response. We can't reach that response here, but we re-throw
            // unchanged so the host can decide. The synthesized 500 will lack
            // our security headers — the host should ensure error responses go
            // through this middleware too (they do, in the default RR pipeline).
            throw err;
        }
    };
}
