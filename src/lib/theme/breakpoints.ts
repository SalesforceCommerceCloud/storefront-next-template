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
import { createLogger } from '@/lib/logger';
import themeBreakpoints from 'virtual:storefront-next/theme-breakpoints';

/**
 * The active theme's Tailwind breakpoints (`--breakpoint-*` theme variables), name → CSS length as declared
 * (`{ sm: '40rem', md: '48rem', ... }`). This is the same source the `sm:`/`md:`/… utilities are generated from, so
 * JavaScript that needs a breakpoint (responsive image sizing, `matchMedia`) stays in step with the CSS.
 */
export const breakpoints: Readonly<Record<string, string>> = themeBreakpoints;

/**
 * `(min-width: …)` media query for a named theme breakpoint.
 *
 * @throws When the theme does not define the breakpoint (e.g. removed via `--breakpoint-md: initial`).
 */
export function minWidthQuery(name: string): string {
    const value = Object.hasOwn(breakpoints, name) ? breakpoints[name] : undefined;
    if (!value) {
        throw new Error(`The theme does not define --breakpoint-${name}, but this code needs it.`);
    }
    return `(min-width: ${value})`;
}

const logger = createLogger();
const warnedBreakpoints = new Set<string>();

/**
 * Development aid: warns once per name about breakpoint names that the theme does not define, so a misspelled or
 * removed breakpoint is not dropped silently. Call it wherever a consumer accepts breakpoint names from its callers;
 * the message, the dev-only gating and the de-duplication live here. Does nothing in production builds.
 *
 * @param names - Breakpoint names received from a caller.
 * @param known - Names the consumer accepts (the theme's breakpoints plus any implicit ones such as `base`).
 */
export function warnUnknownBreakpoints(names: Iterable<string>, known: Iterable<string>): void {
    if (!import.meta.env.DEV) {
        return;
    }
    const accepted = new Set(known);
    for (const name of names) {
        if (!accepted.has(name) && !warnedBreakpoints.has(name)) {
            warnedBreakpoints.add(name);
            logger.warn(
                `Breakpoint "${name}" is not defined by the theme and is ignored. Known: ${[...accepted].join(', ')}.`
            );
        }
    }
}
