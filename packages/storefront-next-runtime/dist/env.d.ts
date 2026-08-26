//#region src/env/index.d.ts
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
 * Whether the app is running on a deployed Managed Runtime environment.
 *
 * Reads at call time so tests, per-request SSR logic, and browser code see the
 * live value:
 * - `process.env.BUNDLE_ID` during SSR.
 * - `window._BUNDLE_ID` in the browser, injected before application scripts by
 *   the Storefront Next Scripts integration.
 *
 * A real bundle ID (e.g. `'42'`) identifies a deployed environment; unset,
 * empty, or `'local'` identifies local `pnpm dev` / `pnpm preview`.
 *
 * @returns `true` when `BUNDLE_ID` is set and not `'local'` (deployed, real
 * HTTPS); `false` for local development and `pnpm preview`.
 */
declare function isRemote(): boolean;
//#endregion
export { isRemote };
//# sourceMappingURL=env.d.ts.map