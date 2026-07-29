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
 * Mini-PD component-preview route (`/preview/component`).
 *
 * The design-param gate is the load-bearing, deterministic behavior: the route
 * is reachable ONLY in Page Designer EDIT/PREVIEW mode and 404s otherwise — so it
 * is never a public storefront page. The happy-path render depends on a live Page
 * Designer component existing in the connected SCAPI site; it runs only when a
 * known component id is supplied via the `PREVIEW_COMPONENT_ID` env var.
 */

Feature('Mini-PD Component Preview Route').tag('@core').tag('@page-designer');

const { previewComponentPage } = inject();
import { expect } from 'chai';

Scenario('404s when no design param is present (not a public page)', async () => {
    const status = await previewComponentPage.grabStatusFor('componentId=any');
    expect(status, 'no mode param must 404').to.equal(404);
});

Scenario('404s when the mode is not EDIT or PREVIEW', async () => {
    const status = await previewComponentPage.grabStatusFor('mode=VIEW&componentId=any');
    expect(status, 'invalid mode must 404').to.equal(404);
});

Scenario('404s in PREVIEW mode when componentId is missing', async () => {
    const status = await previewComponentPage.grabStatusFor('mode=PREVIEW');
    expect(status, 'missing componentId must 404').to.equal(404);
});

Scenario('renders an existing component in PREVIEW/EDIT mode', async () => {
    const componentId = process.env.PREVIEW_COMPONENT_ID;
    if (!componentId) {
        // No known Page Designer component id for this environment — the gate
        // scenarios above cover the deterministic behavior. Skip rather than flake.
        return;
    }

    const previewStatus = await previewComponentPage.grabStatusFor(`mode=PREVIEW&componentId=${componentId}`);
    expect(previewStatus, 'valid PREVIEW request renders (200)').to.equal(200);

    const editStatus = await previewComponentPage.grabStatusFor(`mode=EDIT&componentId=${componentId}`);
    expect(editStatus, 'valid EDIT request renders (200)').to.equal(200);
});

export {};
