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
import { CHECKOUT_ACTION_INTENTS } from '@/components/checkout/utils/checkout-context-types';
import { shouldRevalidateForTags, normalizeTags } from '../tags';
// @sfdc-extension-line SFDC_EXT_STORE_LOCATOR
import { getActionPath, getStoreSelectionRevalidation } from './shared';

/**
 * Broad subscription: any mutation that touches checkout state emits this tag.
 * No instance ID here: a static route declaration subscribes broadly, matching
 * any emitted `checkout.update` regardless of which action produced it.
 */
export const CHECKOUT_REVALIDATE_TAGS = ['checkout.update'] as const;

// Derived from CHECKOUT_ACTION_INTENTS so a new step intent automatically participates in the skip.
const CHECKOUT_STEP_INTENTS = new Set<string>(Object.values(CHECKOUT_ACTION_INTENTS));

// Base tag-driven revalidation decision. Ambient is on (factory default) so this
// auto-participates when an ambient vocabulary is configured later.
const revalidateByTags = shouldRevalidateForTags([...CHECKOUT_REVALIDATE_TAGS]);

/**
 * `shouldRevalidate` policy for the checkout route.
 *
 * Decision order:
 *   1. 3xx redirect: a structural invariant that wins over everything. The place-order
 *      action destroys the basket then redirects to order confirmation; revalidating
 *      into the now-empty basket would unmount payment-extension UI mid-flow. A redirect
 *      carries no JSON body, so it reports no tags anyway.
 *   2. Store effects: a committed selection refreshes even after a partial account-save failure.
 *      Unknown and explicit no-op results stay held.
 *   3. Published tag: authoritative for a non-redirect action. When an action reports
 *      `revalidateTags`, the tag intersection alone decides, so an action that explicitly
 *      publishes `checkout.update` revalidates and is never muted by the step-intent guard.
 *   4. Step intent: the checkout step actions (contact info, shipping, payment) return the
 *      updated basket in their response and the form applies it directly, so a loader
 *      re-run is a redundant round-trip. They report no tags today, so this guard supplies
 *      the skip; a step that later publishes a tag is decided by the intersection in (3).
 *
 * @see https://reactrouter.com/start/framework/route-module#shouldrevalidate
 */
export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
    const { actionStatus, actionResult, formData } = args;

    if (actionStatus !== undefined && actionStatus >= 300 && actionStatus < 400) {
        return false;
    }

    // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
    if (args.formMethod && args.formMethod !== 'GET') {
        const path = getActionPath(args.formAction, args.currentUrl.origin);
        const storeDecision = path && getStoreSelectionRevalidation(path, actionResult);
        if (typeof storeDecision === 'boolean') return storeDecision;
    }
    // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

    // A published tag is authoritative; let the intersection decide and never mute it.
    const reportedTags = normalizeTags(
        actionResult && typeof actionResult === 'object' && !Array.isArray(actionResult)
            ? (actionResult as Record<string, unknown>).revalidateTags
            : undefined
    );
    if (reportedTags.length > 0) {
        return revalidateByTags(args);
    }

    const intent = formData?.get('intent');
    if (typeof intent === 'string' && CHECKOUT_STEP_INTENTS.has(intent)) {
        return false;
    }

    return revalidateByTags(args);
}
