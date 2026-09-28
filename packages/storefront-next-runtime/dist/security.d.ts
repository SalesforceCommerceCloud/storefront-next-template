import { a as HstsConfig, c as SecurityConfig, i as CspDirectives, n as defaultSecurityHeaders, o as ReferrerPolicyValue, r as CspConfig, s as ResolvedSecurityConfig, t as defaultCspDirectives } from "./defaults.js";
import * as react_router1 from "react-router";
import { MiddlewareFunction, RouterContextProvider } from "react-router";

//#region src/security/contributors/types.d.ts

/**
 * The CSP directive names a contributor may target. Mirrors the keys of
 * `CspDirectives` minus the valueless `upgrade-insecure-requests` (a
 * contributor adds origins; it does not toggle that keyword).
 */
type CspDirectiveName = Exclude<keyof CspDirectives, 'upgrade-insecure-requests'>;
/** A per-directive map of origin strings a contributor wants added. */
type CspContribution = Partial<Record<CspDirectiveName, string[]>>;
/**
 * Context passed to a contributor's `isActive` / `contribute` at BOOT.
 * Intentionally minimal and feature-agnostic: the SDK does not know about
 * any specific feature's config shape (that lives in the template). The
 * template supplies whatever its contributors need via closure when it
 * constructs them — this context only carries SDK-known, boot-stable data.
 */
interface CspResolutionContext {
  /**
   * The fully-resolved customer CSP directives (defaults merged with
   * config.server.ts overrides). Read-only; contributors must not mutate it.
   */
  readonly baseDirectives: Readonly<CspDirectives>;
}
/**
 * A feature's CSP needs, expressed once as a typed contract.
 *
 * Lifecycle: `isActive` and `contribute` run at BOOT only. `perRequest`, when
 * present, marks the contribution as request-varying — its `shouldApply` runs
 * on the hot path and MUST be cheap (string ops on the raw URL only).
 */
interface CspContributor {
  /** Stable unique id — used for dedupe, the fired-set cache key, logging. */
  readonly id: string;
  /** Does this feature apply at all? Reads the feature's own config. Boot-time. */
  isActive(ctx: CspResolutionContext): boolean;
  /** Origins to add, per directive. EXACT hosts. Pure — no I/O. Boot-time. */
  contribute(ctx: CspResolutionContext): CspContribution;
  /**
   * OPTIONAL. Present ONLY when the contribution varies per request.
   * Absent → the contribution folds into the boot-static body (zero hot-path
   * cost). Present → the body is built lazily and cached per fired-set.
   */
  readonly perRequest?: {
    /**
     * Cheap predicate deciding whether this contributor applies to a
     * request. Receives ONLY the raw URL string — no Request, headers,
     * context, or I/O. Must be allocation-free in the common case
     * (e.g. `url => url.includes('mode=')`). No catastrophic-backtracking
     * regexes.
     */
    shouldApply(rawUrl: string): boolean;
  };
}
//#endregion
//#region src/security/middleware.d.ts
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
declare function createSecurityHeadersMiddleware(input?: SecurityConfig, contributors?: readonly CspContributor[]): MiddlewareFunction<Response>;
//#endregion
//#region src/security/nonce.d.ts
/** React Router context carrying the current request's CSP nonce. */
declare const securityContext: react_router1.RouterContext<{
  nonce: string;
} | null>;
/**
 * Read the current request's CSP nonce. Returns `null` when the security
 * middleware is disabled. Server-only — call from a loader or action.
 *
 * Naming: `get*` (not `use*`) because this is not a React hook — it reads
 * the React Router context directly. Mirrors `getLocale` / `getTranslation`
 * in the i18n module.
 *
 * The nonce is meaningful only on the SSR-rendered inline script. On
 * client navigations, the loader runs again and returns a fresh nonce,
 * but no new CSP header is emitted, so the loader-returned value should
 * not be applied to scripts injected client-side.
 *
 * @example
 * ```ts
 * // In root.tsx loader:
 * const nonce = getSecurityNonce(args.context);
 * return { nonce, ...other };
 * ```
 */
declare function getSecurityNonce(context: Readonly<RouterContextProvider>): string | null;
//#endregion
//#region src/security/contributors/resolve-csp.d.ts
interface ResolveCspInput {
  /** Base directives = SDK defaults merged with customer overrides. */
  baseDirectives: CspDirectives;
  /** Contributors to fold in. Guardrail-validated internally at boot (see `resolveCsp`). */
  contributors: readonly CspContributor[];
  /** Override the cache ceiling (testing / tuning). */
  cacheCeiling?: number;
}
interface ResolvedCsp {
  /** Base + active boot-static contributions, unioned. Used by most requests. */
  readonly staticDirectives: CspDirectives;
  /** Directives for a specific request — `staticDirectives` unless a guard fires. */
  directivesForRequest(rawUrl: string): CspDirectives;
}
/**
 * Resolve CSP from base directives + contributors.
 *
 * Boot: contributors are guardrail-validated (fail-loud), then active boot-static
 * contributors fold into `staticDirectives` once.
 * Per request: per-request contributors' cheap `shouldApply(rawUrl)` guards run;
 * if none fire, the shared `staticDirectives` is returned (no build). If some
 * fire, the body is built once and memoized keyed on the fired-set id list.
 *
 * Validation runs here so a consumer cannot resolve a CSP from unvalidated
 * contributors (which could leak a wildcard / non-https / malformed origin into
 * the header). It is boot-time and idempotent.
 */
declare function resolveCsp(input: ResolveCspInput): ResolvedCsp;
//#endregion
//#region src/security/contributors/registry.d.ts
/**
 * Boot-time guardrails for the CSP contributor set. Throws (fail-loud) on any
 * malformed contributor so the problem surfaces in CI / first deploy, not in
 * production. Also emits the resolved contributor set for observability.
 *
 * Each contributor's `contribute()` is validated against the SAME
 * `baseDirectives` the resolver will serve it with — so we validate exactly the
 * contribution that reaches the header, not a probe approximation. `contribute`
 * is expected to be pure (it returns origins to ADD regardless of base), but
 * validating the real output removes any reliance on that assumption.
 *
 * @param baseDirectives The resolved base directives the resolver folds
 * contributions into. Defaults to `{}` for standalone validation.
 */
declare function validateContributors(contributors: readonly CspContributor[], baseDirectives?: Readonly<CspDirectives>): void;
//#endregion
//#region src/security/contributors/origin.d.ts
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
 * The single rule core for CSP contributor origins. Both the boot-time
 * validator (`originError` in `registry.ts`, which rejects non-canonical
 * input and emits messages) and the template-side normalizer
 * (`normalizeCspOrigin`, which strips path/query/fragment) derive from this —
 * so the origin-safety rules live in exactly one place.
 */
/** A safety issue that makes a value unusable as a CSP source origin. */
type CspOriginIssue = 'not-string' | 'wildcard' | 'separator' | 'unparseable' | 'not-https' | 'credentials';
interface CspOriginInspection {
  /** First safety issue, or null when the value is a safe https URL. */
  issue: CspOriginIssue | null;
  /** Canonical scheme+host[:port] origin; null when `issue` is non-null. */
  origin: string | null;
}
/**
 * Inspect a candidate CSP origin against the safety rules: must be a string,
 * contain no `*` (wildcard), no whitespace or CSP separators (`;` `,` — which
 * could split/inject directives), be a parseable `https:` URL, and carry no
 * userinfo credentials. Returns the canonical origin when safe.
 *
 * Note: a safe-but-non-canonical value (e.g. one with a path) has `issue: null`
 * and a normalized `origin` — callers decide whether to normalize (use `origin`)
 * or reject (compare the raw input to `origin`).
 */
declare function inspectCspOrigin(value: string): CspOriginInspection;
/**
 * Normalize a config URL to an exact CSP source origin, or null if unsafe.
 * Strips any path/query/fragment — returns `scheme://host[:port]` only.
 * This is the canonical helper template-side contributors should use to turn
 * a configured URL into a CSP directive value.
 */
declare function normalizeCspOrigin(value: string): string | null;
//#endregion
//#region src/security/contributors/lru-cache.d.ts
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
 * Minimal bounded LRU cache. Map preserves insertion order, so the first key
 * in iteration order is the least-recently-used; `get` re-inserts to refresh
 * recency. No external dependency. Used by the CSP resolver to memoize
 * per-request bodies keyed on the fired-set.
 */
declare class BoundedCache<V> {
  private readonly capacity;
  private readonly store;
  constructor(capacity: number);
  get(key: string): V | undefined;
  set(key: string, value: V): void;
  get size(): number;
}
//#endregion
export { BoundedCache, type CspConfig, type CspContribution, type CspContributor, type CspDirectiveName, type CspDirectives, type CspOriginInspection, type CspOriginIssue, type CspResolutionContext, type HstsConfig, type ReferrerPolicyValue, type ResolveCspInput, type ResolvedCsp, type ResolvedSecurityConfig, type SecurityConfig, createSecurityHeadersMiddleware, defaultCspDirectives, defaultSecurityHeaders, getSecurityNonce, inspectCspOrigin, normalizeCspOrigin, resolveCsp, securityContext, validateContributors };
//# sourceMappingURL=security.d.ts.map