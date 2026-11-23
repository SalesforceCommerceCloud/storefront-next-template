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
/** @sfdc-extension-file SFDC_EXT_STORE_LOCATOR */
import { useStoreLocator } from '@/extensions/store-locator/providers/store-locator';
import { useStoreLocatorLayout } from '@/extensions/store-locator/context/layout';
import {
    SelectionFeedback,
    useStoreSelection,
    useStoreSelectionFeedbackHost,
} from '@/extensions/store-locator/providers/selection';

/** Keep chooser feedback visible across search transitions without eagerly loading chooser layout. */
export default function StoreSelectionFeedback() {
    const { retry } = useStoreSelection();
    useStoreSelectionFeedbackHost();
    const isOpen = useStoreLocator((state) => state.isOpen);
    const { forceMobile, selectionFeedbackVisible } = useStoreLocatorLayout();
    if (selectionFeedbackVisible === false || (selectionFeedbackVisible === undefined && isOpen !== forceMobile))
        return null;
    return <SelectionFeedback retry={retry} />;
}
