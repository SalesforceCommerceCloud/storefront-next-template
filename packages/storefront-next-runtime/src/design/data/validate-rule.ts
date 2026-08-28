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
import type { QualifierContext, VisibilityRuleDef } from './types';

/**
 * Evaluates a visibility rule against a shopper's qualifier context.
 *
 * Campaign-based and non-campaign rules are **mutually exclusive** paths,
 * matching the server's `VisibilityDefinition.isVisible()` logic:
 *
 * - **Campaign-based rule** (has `campaignQualifiers`): only the campaign
 *   qualifiers are checked. Schedule, locale, and customer-group fields are
 *   ignored because the campaign qualification already incorporates those
 *   checks server-side.
 * - **Non-campaign rule**: locale, schedule, AND customer groups are checked.
 *   All specified conditions must pass.
 *
 * When no context is provided and the rule requires campaign or customer group
 * checks, those checks will fail (returning `false`). Schedule checks do not
 * require context and are evaluated against `Date.now()`.
 *
 * @param rule - The visibility rule to evaluate.
 * @param locale - The current locale (e.g. `"en_US"`). Used to check whether the rule applies to this locale.
 * @param context - The shopper's active qualifiers, or `null`/`undefined` if not yet resolved.
 * @returns `true` if the rule's conditions pass, `false` otherwise.
 *
 * @example
 * ```ts
 * import { validateRule } from '@salesforce/storefront-next-runtime/design/data';
 *
 * // Campaign-based rule — only campaign qualifiers are evaluated
 * const campaignRule = {
 *     activeLocales: ['en_US'],
 *     campaignQualifiers: [{ campaignId: 'holiday-sale-2026', promotionId: 'free-shipping' }],
 * };
 *
 * // Non-campaign rule — locale, schedule AND customer groups are evaluated
 * const segmentRule = {
 *     activeLocales: ['en_US', 'fr_FR'],
 *     customerGroups: ['vip-customers'],
 *     schedule: {
 *         start: new Date('2026-12-01').toISOString(),
 *         end: new Date('2026-12-31').toISOString(),
 *     },
 * };
 * ```
 */
export function validateRule(
    rule: VisibilityRuleDef,
    locale: string,
    context?: (QualifierContext & { currentTime?: number }) | null
): boolean {
    // Campaign-based rules and non-campaign rules are mutually exclusive
    // paths, mirroring the server's if/else-if branching.
    if (rule.campaignQualifiers?.length) {
        for (const campaignQualifier of rule.campaignQualifiers) {
            // When promotionId is provided, qualification is keyed by campaign+promotion
            // in `campaignQualifiers`. When omitted, the campaign-only result lives under
            // `campaigns` per the QualifierResolveResponse schema.
            const qualified =
                campaignQualifier.promotionId !== undefined
                    ? context?.campaignQualifiers?.[campaignQualifier.campaignId]?.[campaignQualifier.promotionId]
                    : context?.campaigns?.[campaignQualifier.campaignId];
            if (!qualified) {
                return false;
            }
        }
    } else {
        if (rule.activeLocales && !rule.activeLocales.includes(locale)) {
            return false;
        }

        // Rule schedule times are in ISO 8601 format, so we need to convert them to milliseconds
        if (rule.schedule) {
            const now = context?.currentTime ?? Date.now();

            if (rule.schedule.start) {
                const startTimeInMillis = new Date(rule.schedule.start).getTime();

                // If the start time is invalid, the rule fails
                if (Number.isNaN(startTimeInMillis) || startTimeInMillis >= now) {
                    return false;
                }
            }

            if (rule.schedule.end) {
                const endTimeInMillis = new Date(rule.schedule.end).getTime();

                // If the end time is invalid, the rule fails
                if (Number.isNaN(endTimeInMillis) || endTimeInMillis <= now) {
                    return false;
                }
            }
        }

        if (rule.customerGroups) {
            for (const customerGroup of rule.customerGroups) {
                if (!context?.customerGroups?.[customerGroup]) {
                    return false;
                }
            }
        }
    }

    return true;
}
