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
import { useEffect } from 'react';
import { usePageDesignerMode } from '@salesforce/storefront-next-runtime/design/react/core';
import { useBlocker } from 'react-router';

/**
 * Imports the Page Designer styles when in design mode.
 */
export function PageDesignerInit() {
    const { isDesignMode } = usePageDesignerMode();

    // Prevent navigation in React Router when in Page Designer design mode
    // so that clicks on links don't cause route changes during editing.
    useBlocker(() => isDesignMode);

    // Dynamically import the Page Designer global styles only when in design mode.
    useEffect(() => {
        if (isDesignMode) {
            void import('@salesforce/storefront-next-runtime/design/styles.css');
        }
    }, [isDesignMode]);

    return <></>;
}
