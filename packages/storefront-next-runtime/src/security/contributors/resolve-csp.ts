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

import type { CspDirectives } from '../types.js';
import { BoundedCache } from './lru-cache.js';
import { validateContributors } from './registry.js';
import type { CspContribution, CspContributor, CspDirectiveName } from './types.js';

/** Default cap on memoized per-request bodies. Tunable; see the design doc. */
const DEFAULT_CACHE_CEILING = 256;

export interface ResolveCspInput {
    /** Base directives = SDK defaults merged with customer overrides. */
    baseDirectives: CspDirectives;
    /** Contributors to fold in. Guardrail-validated internally at boot (see `resolveCsp`). */
    contributors: readonly CspContributor[];
    /** Override the cache ceiling (testing / tuning). */
    cacheCeiling?: number;
}

export interface ResolvedCsp {
    /** Base + active boot-static contributions, unioned. Used by most requests. */
    readonly staticDirectives: CspDirectives;
    /** Directives for a specific request — `staticDirectives` unless a guard fires. */
    directivesForRequest(rawUrl: string): CspDirectives;
}

/** Union `addition` into `target` per directive, de-duplicating, returning a new map. */
function mergeContribution(target: CspDirectives, addition: CspContribution): CspDirectives {
    const out: CspDirectives = { ...target };
    for (const [directive, origins] of Object.entries(addition) as [CspDirectiveName, string[]][]) {
        const existing = out[directive] ?? [];
        const merged = [...existing];
        for (const origin of origins) if (!merged.includes(origin)) merged.push(origin);
        out[directive] = merged;
    }
    return out;
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
export function resolveCsp(input: ResolveCspInput): ResolvedCsp {
    const { baseDirectives, contributors } = input;
    const ceiling = input.cacheCeiling ?? DEFAULT_CACHE_CEILING;

    // Fail loud on any malformed contributor before it can reach a header.
    // Validate against the real base so we check exactly what gets served.
    validateContributors(contributors, baseDirectives);

    const active = contributors.filter((c) => c.isActive({ baseDirectives }));
    const bootStatic = active.filter((c) => c.perRequest === undefined);

    // Boot-static fold → single shared body.
    let staticDirectives: CspDirectives = { ...baseDirectives };
    for (const c of bootStatic) {
        staticDirectives = mergeContribution(staticDirectives, c.contribute({ baseDirectives }));
    }

    // Pre-compute each active per-request contributor's contribution ONCE at boot.
    // `contribute` is pure and its origins are config-derived (stable for the
    // process), so there is no reason to re-invoke it on the request path. The
    // hot path reuses these stored contributions, and the bytes that reach the
    // header are exactly the boot-time (already-validated) output.
    const perRequest: {
        id: string;
        perRequest: NonNullable<CspContributor['perRequest']>;
        contribution: CspContribution;
    }[] = [];
    for (const c of active) {
        if (c.perRequest === undefined) continue;
        // Keep the `perRequest` object intact (rather than extracting `shouldApply`)
        // so the guard is always invoked as a method — never an unbound reference.
        perRequest.push({ id: c.id, perRequest: c.perRequest, contribution: c.contribute({ baseDirectives }) });
    }

    // Cache sizing: min(2^P, ceiling). Warn when 2^P would exceed the ceiling.
    const p = perRequest.length;
    const combos = p >= 31 ? Number.POSITIVE_INFINITY : 2 ** p;
    if (combos > ceiling) {
        // oxlint-disable-next-line no-console
        console.warn(
            `[security] CSP per-request contributors P=${p} → 2^${p} possible bodies exceeds cache ceiling ${ceiling}; LRU eviction may cause rebuilds. Review whether this many per-request contributors is intended.`
        );
    }
    const capacity = Math.max(1, Math.min(combos, ceiling));
    const cache = new BoundedCache<CspDirectives>(capacity);

    function directivesForRequest(rawUrl: string): CspDirectives {
        if (perRequest.length === 0) return staticDirectives;

        // Cheap hot-path scan: which per-request contributors fire? Allocate the
        // `fired` array lazily — only once a guard actually matches — so the
        // common "none fired" path stays allocation-free.
        let firedKey = '';
        let fired: { contribution: CspContribution }[] | undefined;
        for (const c of perRequest) {
            if (c.perRequest.shouldApply(rawUrl)) {
                (fired ??= []).push(c);
                firedKey += firedKey ? `|${c.id}` : c.id;
            }
        }
        if (fired === undefined) return staticDirectives;

        const cached = cache.get(firedKey);
        if (cached) return cached;

        // Reuse the boot-computed contributions — `contribute` is never called here.
        let built = staticDirectives;
        for (const c of fired) built = mergeContribution(built, c.contribution);
        cache.set(firedKey, built);
        return built;
    }

    return { staticDirectives, directivesForRequest };
}
