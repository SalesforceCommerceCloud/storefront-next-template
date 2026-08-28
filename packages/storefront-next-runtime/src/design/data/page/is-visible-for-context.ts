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
import type { QualifierContext, VisibilityRuleDef } from '../types';
import { validateRule } from '../validate-rule';

export interface VisibilityContext {
    locale: string;
    qualifiers: (QualifierContext & { currentTime?: number }) | null;
}

/**
 * Determines whether a component is visible for the current locale and shopper qualifiers.
 *
 * Components without visibility rules are visible. When rules are present, the
 * component is visible if at least one rule matches the provided context.
 *
 * @param rules - The component's visibility rules.
 * @param ctx - The locale and shopper qualifiers used to evaluate each rule.
 * @returns `true` when the component has no rules or at least one rule matches.
 */
export function isVisibleForContext(rules: VisibilityRuleDef[], ctx: VisibilityContext): boolean {
    return rules.length === 0 || rules.some((rule) => validateRule(rule, ctx.locale, ctx.qualifiers));
}
