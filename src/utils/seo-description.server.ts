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
import { Parser } from 'htmlparser2';

/** Maximum meta description length. Search engines truncate snippets at roughly this width. */
export const MAX_SEO_DESCRIPTION_LENGTH = 160;

/** Longest raw input parsed. Only `maxLength` characters of output are kept, so unbounded CMS copy is cut first. */
const MAX_INPUT_LENGTH = 10_000;

/** Elements whose content is never readable text. */
const SKIPPED_ELEMENTS = new Set(['script', 'style', 'noscript', 'template']);

/**
 * Returns the readable text of an HTML fragment with entities decoded. Tags become spaces so adjacent
 * blocks don't run together; comments, doctypes and processing instructions are dropped, and so is a tag
 * left unterminated at the end of the input.
 */
function htmlToText(html: string): string {
    let text = '';
    let skipDepth = 0;
    const parser = new Parser({
        onopentagname(name) {
            if (SKIPPED_ELEMENTS.has(name)) skipDepth++;
            text += ' ';
        },
        onclosetag(name) {
            if (SKIPPED_ELEMENTS.has(name)) skipDepth = Math.max(0, skipDepth - 1);
            text += ' ';
        },
        ontext(data) {
            if (skipDepth === 0) text += data;
        },
    });
    parser.end(html);
    return text;
}

function truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) return value;

    const candidate = value.slice(0, maxLength - 1);
    const lastSpace = candidate.lastIndexOf(' ');
    // Cut at a word boundary unless that would discard more than half the budget (one very long word).
    let cut = lastSpace > (maxLength - 1) / 2 ? candidate.slice(0, lastSpace) : candidate;
    // Don't leave half of a surrogate pair (emoji) before the ellipsis.
    if (/[\ud800-\udbff]$/.test(cut)) cut = cut.slice(0, -1);
    return `${cut.trimEnd().replace(/[\s,:;.!?\-–—]+$/u, '')}…`;
}

/**
 * Converts catalog or CMS copy, which may contain authored HTML, into a plain-text meta description.
 *
 * Parses the markup with `htmlparser2`, keeping only readable text (no `<script>`, `<style>`, comments
 * or tags) with HTML entities decoded. Then replaces control and invisible formatting characters,
 * collapses whitespace, and truncates at a word boundary to `maxLength` characters (including the
 * trailing ellipsis).
 *
 * Server-only: call it in a loader and pass the result to `SeoMeta`, so the parser stays out of the
 * client bundle.
 *
 * @returns The plain-text description, or `undefined` when nothing readable remains.
 */
export function toSeoDescription(
    value: string | null | undefined,
    maxLength: number = MAX_SEO_DESCRIPTION_LENGTH
): string | undefined {
    if (!value) return undefined;

    const text = htmlToText(value.slice(0, MAX_INPUT_LENGTH))
        // oxlint-disable-next-line no-control-regex -- control characters are exactly what is being removed
        .replace(/[\u0000-\u001f\u007f-\u009f\ufffd\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, ' ')
        .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return text ? truncate(text, Math.max(1, maxLength)) : undefined;
}

/**
 * Returns the first candidate that still has readable text after {@link toSeoDescription}.
 * Accepts a single value or an ordered list of fallbacks.
 *
 * @example
 * // In a loader:
 * const seoDescription = resolveSeoDescription([product.pageDescription, product.shortDescription, fallback]);
 */
export function resolveSeoDescription(
    candidates: string | ReadonlyArray<string | null | undefined> | null | undefined,
    maxLength: number = MAX_SEO_DESCRIPTION_LENGTH
): string | undefined {
    const list = typeof candidates === 'string' || candidates == null ? [candidates] : candidates;
    for (const candidate of list) {
        const description = toSeoDescription(candidate, maxLength);
        if (description) return description;
    }
    return undefined;
}
