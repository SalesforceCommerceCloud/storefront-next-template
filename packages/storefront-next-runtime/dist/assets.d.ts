//#region src/assets/index.d.ts
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
 * Return the runtime URL prefix for emitted client bundle resources.
 *
 * In the browser, the Managed Runtime-aware Scripts integration injects the
 * authoritative bundle path. During SSR, the path is derived from
 * `MRT_ENV_BASE_PATH` and `BUNDLE_ID`. Local development and preview default to
 * the `local` bundle ID.
 */
declare function getClientBundlePath(): string;
//#endregion
export { getClientBundlePath };
//# sourceMappingURL=assets.d.ts.map