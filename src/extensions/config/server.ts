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

// NOTE: This file is auto-generated. Do not edit manually.
// Run 'pnpm config:aggregate-extensions' to regenerate this file.

import storeLocatorConfig from '../store-locator/server-config';

// Each extension's server-config.ts default export is namespaced by the camelCase of its
// folder name (e.g. loqate-address-verification -> loqateAddressVerification), making it
// available at config.app.serverExtension.<key> on the server only. Values never reach the
// browser: the client extractor strips app.serverExtension before window.__APP_CONFIG__,
// and a Vite plugin fails the build if any client chunk imports this barrel. There is no
// PUBLIC__ override path by design — the AST validator forbids process.env, so server-only
// secrets must be read from process.env in a route handler instead.
export default {
    storeLocator: storeLocatorConfig,
};
