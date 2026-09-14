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
 * Returns the final raw path segment of the request URL, decoded only after it has
 * been isolated.
 *
 * Under the SEO route aliases (a configured product/category prefix routes through
 * a pathless parent whose `{prefix}/*` alias children own the splat), the resource
 * ID always sits in the last path segment for both `/{prefix}/{id}` and
 * `/{prefix}/{slug}/{id}` forms. It is read from the raw URL rather than React
 * Router's `params["*"]` because the splat is already percent-decoded, which would
 * mis-split an ID whose encoded form contains a slash; isolating the raw segment
 * first and decoding after keeps the boundary between segments unambiguous.
 *
 * Takes the already-parsed `URL` the loader builds for `searchParams`, so the
 * request URL is parsed once per load.
 *
 * `params` are the loader's route params. When the alias splat (`params["*"]`) is
 * present but empty, the URL is the bare SEO prefix with no resource ID
 * (`/{prefix}`, `/{prefix}/`, `/{prefix}//`); returning an empty ID lets the lookup
 * 404 rather than resolving the prefix segment itself as an ID. Only the splat's
 * emptiness is inspected — never its value, which is percent-decoded and would
 * mis-split; the ID is still read from the raw URL below.
 *
 * A final `.html` stays part of the returned ID — the deterministic route treats
 * the whole segment as the ID.
 */
export function decodeFinalRawSegment(url: URL, params?: Record<string, string | undefined>): string {
    const aliasSplat = params?.['*'];
    if (aliasSplat !== undefined && !/[^/]/.test(aliasSplat)) {
        return '';
    }
    const { pathname } = url;
    const withoutTrailingSlashes = pathname.replace(/\/+$/, '');
    const rawSegment = withoutTrailingSlashes.slice(withoutTrailingSlashes.lastIndexOf('/') + 1);
    try {
        return decodeURIComponent(rawSegment);
    } catch {
        // Malformed percent-encoding is client-supplied input at the URL boundary. Keep the
        // raw segment so the resource lookup 404s cleanly rather than throwing a 500 from decode.
        return rawSegment;
    }
}
