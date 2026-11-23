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
// @sfdc-extension-line SFDC_EXT_STORE_LOCATOR
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import {
    getActionPath,
    isAmbientMutation,
    // @sfdc-extension-line SFDC_EXT_STORE_LOCATOR
    isStoreInventoryMutation,
    // @sfdc-extension-line SFDC_EXT_STORE_LOCATOR
    isStoreQualificationMutation,
} from './shared';

/** Category windows and carousels read preparing-store stock as well as qualified prices. */
export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
    if (!args.formMethod || args.formMethod === 'GET') return false;
    const actionPath = getActionPath(args.formAction, args.currentUrl.origin);
    if (!actionPath) return false;
    // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
    if (
        isStoreQualificationMutation(actionPath, args.actionResult) ||
        (getConfig().features?.localInventory?.enabled && isStoreInventoryMutation(actionPath, args.actionResult))
    )
        return true;
    // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR
    return isAmbientMutation(actionPath);
}
