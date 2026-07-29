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
 * Client-safe constants for the mini-PD component-preview canvas.
 *
 * These live outside `preview-page.server.ts` so the route's client component can
 * import them without pulling the server-only module into the browser bundle.
 * React Router strips server code only from `loader`/`action`/`middleware`/`headers`;
 * a `.server` import reached from the default (component) export fails the build.
 */

/**
 * Region id of the synthesized preview page that hosts the previewed component.
 * The route renders `<Region page={…} regionId={PREVIEW_REGION_ID}>`.
 */
export const PREVIEW_REGION_ID = 'preview';

/** Id of the synthesized (non-SCAPI) preview page. Never fetched from the backend. */
export const PREVIEW_PAGE_ID = '__sfnext_preview__';
