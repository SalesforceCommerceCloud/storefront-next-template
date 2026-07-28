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
import type { ShouldRevalidateFunctionArgs } from 'react-router';

// ─────────────────────────────────────────────────────────────────────────────
// Tag Groups
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A tag spec is either a plain string tag or a TagGroup (which bundles a tag with its reactive dependencies).
 */
export type TagSpec = string | TagGroup;

/**
 * A reusable bundle: a primary tag plus the tags it transitively depends on.
 * Created via `tagGroup()`. Consumed by `shouldRevalidateForTags()`.
 */
export type TagGroup = {
    readonly tag: string;
    readonly deps: readonly TagSpec[];
};

/**
 * Create a tag group — a named tag bundled with its reactive dependencies.
 *
 * @example
 * export const cartTotals = tagGroup('cart.totals', ['cart.lineItems.*', 'cart.promotions']);
 * export const cartShipping = tagGroup('cart.shipping', [cartTotals, 'store']);
 */
export function tagGroup(tag: string, deps: TagSpec[] = []): TagGroup {
    return { tag, deps };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tag Matching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Splits a single tag segment into its name and optional instance ID at the FIRST colon. Everything after that colon
 * is the ID verbatim, so a composite key whose ID itself contains colons (e.g. `lineItems:store:NY-7` → name
 * `lineItems`, ID `store:NY-7`) stays intact instead of being truncated to its first colon-delimited piece.
 */
function splitSegment(segment: string): [string, string | undefined] {
    const colon = segment.indexOf(':');
    return colon === -1 ? [segment, undefined] : [segment.slice(0, colon), segment.slice(colon + 1)];
}

/**
 * Tests whether a tag `pattern` declared on a `shouldRevalidate` subscription matches a tag `emitted` by a mutation,
 * deciding whether that route or fetcher should revalidate.
 *
 * Tags are dot-separated segments, each optionally pinning an instance ID with a colon (e.g. `product:ABC123.price`,
 * `cart.lineItems:li-7`). The ID is everything after the first colon, so an ID may itself contain colons
 * (`lineItems:store:NY-7` → name `lineItems`, ID `store:NY-7`). Matching follows "publish specific, subscribe broad":
 * mutations emit the exact tag they touched, subscriptions declare whatever granularity they depend on.
 *
 * Rules:
 * - Segment names must match positionally.
 * - Exact match: `cart.lineItems:li-7` matches only itself.
 * - Wildcard suffix (`.*`): prefix match at any depth.
 *   `cart.*` matches `cart`, `cart.lineItems`, `cart.lineItems:li-7`.
 * - Bidirectional instance-omission: a segment without `:id` on EITHER side means "all instances." Only when both
 *   sides pin an ID and they differ does the match fail.
 *
 * @param pattern - A subscribed tag from `shouldRevalidate`, optionally ending in `.*`.
 * @param emitted - A single tag reported by a mutation.
 * @returns `true` if the subscription to `pattern` depends on `emitted`.
 * @example
 * matchesTag('cart.*', 'cart.lineItems:li-7');        // true  — wildcard prefix
 * matchesTag('checkout.update', 'checkout.update');   // true  — exact
 * matchesTag('product.price', 'product:ABC.price');   // true  — pattern omits the id
 * matchesTag('checkout.update', 'checkout.payment');  // false — different operation
 */
export function matchesTag(pattern: string, emitted: string): boolean {
    const isWildcard = pattern.endsWith('.*');
    const patternBase = isWildcard ? pattern.slice(0, -2) : pattern;

    const pSegments = patternBase.split('.');
    const eSegments = emitted.split('.');

    // Pattern segments must match as a prefix (wildcard) or exactly (no wildcard).
    if (!isWildcard && pSegments.length !== eSegments.length) {
        return false;
    }
    if (isWildcard && eSegments.length < pSegments.length) {
        return false;
    }

    for (let i = 0; i < pSegments.length; i++) {
        const [pName, pId] = splitSegment(pSegments[i]);
        const [eName, eId] = splitSegment(eSegments[i]);

        // Segment names must match.
        if (pName !== eName) {
            return false;
        }

        // Instance ID rule (bidirectional):
        // Only reject when BOTH sides pin an ID and the IDs differ.
        // If either side omits the ID, it means "all instances" → always compatible.
        if (pId !== undefined && eId !== undefined && pId !== eId) {
            return false;
        }
    }

    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tag Implications (Ambient / Global Cascades) — emitter-side expansion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map of ambient tag implications: each key is a trigger *pattern* (may use `.*`), each value is the list of
 * *concrete* tags implied when the trigger matches.
 */
export type TagImplicationMap = Record<string, string[]>;

/**
 * Define ambient tag implications — structural "if X then also Y" rules. Returns an expander that takes the tags a
 * mutation emitted and returns them plus every implied tag, transitively, until no new tag appears (fixed-point).
 * Cycles are safe: an internal Set stops re-processing already-seen tags.
 *
 * This expander runs on the EMITTER side (it grows the mutation's reported tags), the mirror of `tagGroup`, which
 * grows the SUBSCRIBER side. That asymmetry dictates the value/key shapes below — they are not interchangeable with
 * `TagSpec`:
 * - Trigger keys are matched as `matchesTag` *patterns*, so a key MAY carry `.*` (`'cart.*': [...]`).
 * - Implied values land on the emitted side, where `matchesTag` reads them as concrete tags it compares a
 *   subscription pattern against. They MUST stay plain, instance-free strings: a `.*` here is treated as a literal
 *   segment named `*`, not a wildcard (wildcards are subscriber-only), so it matches only by accident — never the set
 *   of tags the author intended. `TagGroup` deps would likewise smuggle subscriber patterns onto the wrong side.
 *   Hence `string[]`, not `TagSpec[]`.
 *
 * @example
 * const expand = tagImplications({
 *   'cart.lineItems': ['cart.totals', 'cart.itemCount'], // bulk emit reaches per-line-item subscribers
 *   'cart.promotions': ['cart.totals'],
 *   'store': ['cart.shipping'],                          // chains: store → shipping → … (transitive)
 * });
 *
 * expand(['cart.lineItems:li-7'])
 * // → ['cart.lineItems:li-7', 'cart.totals', 'cart.itemCount']
 */
export function tagImplications(map: TagImplicationMap) {
    // The map never mutates during expansion, so snapshot its entries once instead of rebuilding them per queued tag.
    const entries = Object.entries(map);

    return function expandImplications(emitted: string[]): string[] {
        const result = new Set(emitted);
        const queue = [...emitted];

        while (queue.length > 0) {
            const tag = queue.shift();

            for (const [trigger, implied] of entries) {
                if (tag && matchesTag(trigger, tag)) {
                    for (const t of implied) {
                        if (!result.has(t)) {
                            result.add(t);
                            queue.push(t); // newly discovered → check for further implications
                        }
                    }
                }
            }
        }

        return [...result];
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// shouldRevalidateForTags (the shouldRevalidate factory)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The ambient vocabulary — context dimensions that cut across nearly every SCAPI response, appended to every
 * subscription unless opted out with `ambient: false`.
 *
 * Empty by default: the cross-cutting set is meant to be defined per app. An empty vocabulary makes the ambient branch
 * a no-op, so subscriptions match only their declared tags.
 */
const DEFAULT_AMBIENT_TAGS: readonly string[] = [];

type TagDeclaration = TagSpec[] | ((ctx: { params: Record<string, string | undefined> }) => TagSpec[]);

type ShouldRevalidateForTagsOptions = {
    /** Include ambient tags in this subscription. Default: true. */
    ambient?: boolean;
    /** Ambient implication expander. If provided, emitted tags are expanded before matching. */
    expand?: (emitted: string[]) => string[];
};

/**
 * Factory that produces a `shouldRevalidate` function for a route or fetcher.
 *
 * @param spec - Static array of TagSpecs, or a function of `{ params }` returning TagSpecs.
 * @param options - Optional: disable ambient tags or provide an implication expander.
 *
 * @example
 * // Static — broad subscription, no instance IDs:
 * export const shouldRevalidate = shouldRevalidateForTags(['cart.*']);
 *
 * // Dynamic — pins to a specific entity via route params:
 * export const shouldRevalidate = shouldRevalidateForTags(
 *   ({ params }) => [`product:${params.sku}.*`]
 * );
 *
 * // With tag group:
 * import { cartTotals } from '~/features/cart/tags';
 * export const shouldRevalidate = shouldRevalidateForTags([cartTotals]);
 *
 * // Opt out of ambient tags:
 * export const shouldRevalidate = shouldRevalidateForTags(['country-list'], { ambient: false });
 *
 * // Compose with a custom condition (escape hatch) — keep the tag decision as the
 * // base and layer an extra guard on top, e.g. only revalidate while a drawer is open:
 * const revalidateCart = shouldRevalidateForTags(['cart.*']);
 * export const shouldRevalidate = (args) =>
 *   revalidateCart(args) && args.nextUrl.searchParams.get('drawer') === 'open';
 */
export function shouldRevalidateForTags(
    spec: TagDeclaration,
    { ambient = true, expand }: ShouldRevalidateForTagsOptions = {}
) {
    // Resolve declared tags into the set this subscription matches against.
    const resolveDeclared = (declared: TagSpec[]): string[] => {
        const resolved = resolveTags(declared);
        return ambient ? [...resolved, ...DEFAULT_AMBIENT_TAGS] : resolved;
    };
    // A static spec is constant across every invocation, so resolve it once and reuse the cached array. A function
    // spec depends on per-call route params, so resolve it on each invocation.
    let resolveMine: (params: Record<string, string | undefined>) => string[];
    if (typeof spec === 'function') {
        resolveMine = (params) => resolveDeclared(spec({ params }));
    } else {
        const cached = resolveDeclared(spec);
        resolveMine = () => cached;
    }

    return (
        ctx: ShouldRevalidateFunctionArgs & {
            /** Narrowed from RR's `any` to surface the tags an action reports. */
            // oxlint-disable-next-line @typescript-eslint/no-explicit-any
            actionResult?: { revalidateTags?: string[]; [key: string]: any };
        }
    ): boolean => {
        // A non-GET `formMethod` is the reliable "a submission triggered this" signal: React Router sets it for every
        // navigation and fetcher submission, whereas `actionResult` is absent when an action returns `null`/`undefined`
        // or throws. Keying off `actionResult` would misclassify those mutations as plain navigations.
        if (ctx.formMethod !== undefined && ctx.formMethod !== 'GET') {
            // Tags decide regardless of HTTP status. A failed action can still have mutated server state.
            const rawTouched = ctx.actionResult?.revalidateTags;
            const touched = normalizeTags(rawTouched);

            // A mutation that reports no tags → fall back to RR default (which revalidates after actions). This keeps
            // untagged or legacy actions safe: they still revalidate rather than silently leaving the loader stale.
            if (touched.length === 0) {
                return ctx.defaultShouldRevalidate;
            }

            // Expand emitted tags through ambient implications (if configured).
            const effectiveTouched = expand ? expand(touched) : touched;

            // Cached for a static spec; resolved against this call's route params for a function spec.
            const mine = resolveMine(ctx.nextParams);

            // Match: does any emitted tag intersect with any declared tag?
            return effectiveTouched.some((emitted) => mine.some((pattern) => matchesTag(pattern, emitted)));
        }

        return ctx.defaultShouldRevalidate;
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Merge revalidation tags into an action's return value.
 * Pure sugar — does the same as `{ ...data, revalidateTags }`.
 *
 * @example
 * return withRevalidateTags({ line }, ['cart.lineItems:li-7']);
 */
// oxlint-disable-next-line @typescript-eslint/no-explicit-any
export function withRevalidateTags<T extends Record<string, any>>(
    data: T,
    tags: string[]
): T & { revalidateTags: string[] } {
    return { ...data, revalidateTags: tags };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Coerces an untrusted `revalidateTags` value from an action response into a string array. Arrays have every element
 * stringified; any non-array (including `undefined`, `null`, or a scalar) becomes an empty array, so a malformed or
 * absent field safely yields "no tags reported" rather than throwing.
 *
 * @param value - The `revalidateTags` field off an action result, of unknown shape.
 * @returns The reported tags as strings, or `[]` when none were provided.
 *
 * @internal Implementation detail of `shouldRevalidateForTags`. Exported for testing only.
 */
export function normalizeTags(value: unknown): string[] {
    return Array.isArray(value) ? value.map(String) : [];
}

/**
 * Expand an array of TagSpecs into a flat string array.
 * Resolves TagGroups recursively with cycle tolerance (via object identity).
 *
 * @internal Implementation detail of `shouldRevalidateForTags`. Exported for testing only.
 */
export function resolveTags(specs: readonly TagSpec[], seen = new Set<TagGroup>()): string[] {
    return specs.flatMap((spec: TagSpec) => {
        if (typeof spec === 'string') return [spec];
        if (seen.has(spec)) {
            // cycle → stop, keep the tag itself
            return [spec.tag];
        }
        seen.add(spec);
        return [spec.tag, ...resolveTags(spec.deps, seen)];
    });
}
