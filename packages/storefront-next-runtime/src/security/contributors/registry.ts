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
import { VALID_CSP_DIRECTIVES } from '../schema.js';
import { inspectCspOrigin } from './origin.js';
import type { CspContributor, CspContribution } from './types.js';

// Contributors add origin lists; they may NOT target the valueless
// `upgrade-insecure-requests` keyword (excluded from `CspDirectiveName` too).
// Keeping the runtime set aligned with the type prevents a contribution that
// assigns an array to that directive and corrupts it.
const DIRECTIVE_SET = new Set<string>(VALID_CSP_DIRECTIVES.filter((d) => d !== 'upgrade-insecure-requests'));

/**
 * Validate a single contributor origin string. Returns an error message, or
 * null when valid. Rules: https only, no wildcard, no whitespace or CSP
 * separators that could split/inject directives.
 */
function originError(origin: string): string | null {
    // Validation derives from the shared rule core (`inspectCspOrigin`); this
    // function owns only the human-readable messages. The normalizer
    // (`normalizeCspOrigin`) used by template-side contributors shares the same
    // core, so the two cannot drift.
    const { issue, origin: canonical } = inspectCspOrigin(origin);
    switch (issue) {
        case 'wildcard':
            return `wildcard not allowed in contributor origin: "${origin}"`;
        case 'separator':
            return `invalid origin (whitespace or separator): "${origin}"`;
        case 'not-string':
        case 'unparseable':
            return `invalid origin (unparseable): "${origin}"`;
        case 'not-https':
            return `contributor origin must be https: "${origin}"`;
        case 'credentials':
            return `invalid origin (must not contain credentials): "${origin}"`;
    }
    // Require an exact, canonical scheme+host(+port) origin. Rejecting anything
    // where the raw input differs from its canonical origin catches a
    // path/query/fragment, an empty authority (`https:///x`, `https:foo`), or
    // stray control chars — since the raw string, not the normalized URL, is
    // what gets serialized into the CSP header.
    if (origin !== canonical) {
        return `invalid origin (must be an exact scheme+host[:port] with no path/query/fragment): "${origin}"`;
    }
    return null;
}

function validateContribution(id: string, contribution: CspContribution): void {
    for (const [directive, origins] of Object.entries(contribution)) {
        if (!DIRECTIVE_SET.has(directive)) {
            throw new Error(`[security] contributor "${id}" targets unknown directive "${directive}".`);
        }
        for (const origin of origins ?? []) {
            const err = originError(origin);
            if (err) throw new Error(`[security] contributor "${id}": ${err}`);
        }
    }
}

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
export function validateContributors(
    contributors: readonly CspContributor[],
    baseDirectives: Readonly<CspDirectives> = {}
): void {
    const seen = new Set<string>();
    const ctx = { baseDirectives };
    const summaries: string[] = [];

    for (const c of contributors) {
        if (typeof c.id !== 'string' || c.id.trim() === '') {
            throw new Error('[security] contributor has a missing or empty id.');
        }
        // Ids form the per-request fired-set cache key (joined with `|`). Restrict
        // them to a safe charset so an id can never embed the `|` separator (or a
        // `,`) and collide two distinct fired-sets onto the same cached CSP body.
        if (!/^[A-Za-z0-9._-]+$/.test(c.id)) {
            throw new Error(
                `[security] contributor id "${c.id}" must match /^[A-Za-z0-9._-]+$/ (no separators or whitespace).`
            );
        }
        if (seen.has(c.id)) {
            throw new Error(`[security] duplicate contributor id "${c.id}".`);
        }
        seen.add(c.id);

        if (typeof c.isActive !== 'function' || typeof c.contribute !== 'function') {
            throw new Error(`[security] contributor "${c.id}" must define isActive and contribute.`);
        }

        if (c.perRequest !== undefined && typeof c.perRequest.shouldApply !== 'function') {
            throw new Error(`[security] contributor "${c.id}" perRequest.shouldApply must be a function.`);
        }

        // Validate the exact contribution the resolver will serve, then reuse it
        // for the observability summary (one `contribute()` call per contributor).
        const contribution = c.contribute(ctx);
        validateContribution(c.id, contribution);
        const dirs = Object.keys(contribution).join(',');
        summaries.push(`${c.id}[${dirs}]${c.perRequest ? '(perRequest)' : ''}`);
    }

    // Observability: one line listing each contributor + directives touched.
    // oxlint-disable-next-line no-console
    console.info(`[security] CSP contributors registered: ${summaries.join(' ') || '(none)'}`);
}
