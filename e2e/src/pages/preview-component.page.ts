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

const { I } = inject();
import { buildSitePath } from '../utils/url-utils';

/**
 * Page object for the mini-PD component-preview route (`/preview/component`).
 *
 * The route is gated on the Page Designer design param: it renders only when the
 * request carries `?mode=EDIT` or `?mode=PREVIEW`, and returns HTTP 404 otherwise.
 * We read the navigation Response status directly (via Playwright) because the
 * status code — not just the rendered DOM — is the behavior under test.
 */
class PreviewComponentPage {
    /**
     * Navigate to the preview/component route with the given query string and
     * return the HTTP status of the document response.
     *
     * @param query - The query string to append (without a leading `?`), e.g.
     *   `mode=PREVIEW&componentId=foo` or `` for no params.
     */
    async grabStatusFor(query: string): Promise<number> {
        const baseUrl = process.env.BASE_URL || 'http://localhost:5173';
        const path = buildSitePath('/preview/component') + (query ? `?${query}` : '');
        const url = new URL(path, baseUrl).toString();
        let status = 0;
        await I.usePlaywrightTo('grab preview-component response status', async ({ page }) => {
            const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
            status = response?.status() ?? 0;
        });
        return status;
    }
}

export = new PreviewComponentPage();
