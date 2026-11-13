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
// `import type` only — types/config.ts also imports `ClientAppConfig` from this file,
// so a value import here would create a runtime cycle. Erased at emit by
// verbatimModuleSyntax; do not promote to `import { AppConfig }`.
import type { AppConfig } from '@/types/config';

/**
 * Top-level AppConfig keys that hold server-only values and must never reach the browser.
 * Listed here so the runtime serializer (`extractClientConfig`) and the build-time bundle
 * guard (`vite-plugins/server-only-config-guard.ts`) read from a single source of truth —
 * one day's "stripped at JSON.stringify, also denied to client chunks" can't drift into
 * the other's silent miss.
 *
 * **Top-level only** — `extractClientConfig` deletes by direct property name, not by dotted
 * path. A future server-only field nested under another namespace (e.g. `app.foo.internal`)
 * needs a richer extractor; don't just append `'foo.internal'` to this list and expect the
 * existing `delete out[key]` to traverse into nested objects.
 */
export const SERVER_ONLY_NAMESPACES = ['serverExtension'] as const;

export type ServerOnlyNamespace = (typeof SERVER_ONLY_NAMESPACES)[number];

export type ClientAppConfig = Omit<AppConfig, ServerOnlyNamespace | 'features'> & {
    features: Omit<AppConfig['features'], 'shopperContext'> & {
        shopperContext: Omit<AppConfig['features']['shopperContext'], 'storeSelection'>;
    };
};

/**
 * Strip every server-only namespace from `app` before it gets serialized into
 * `window.__APP_CONFIG__`. The build-time guard prevents a client module from importing
 * the server-only barrel; this filter prevents the same values from hitching a ride
 * inside the JSON-stringified config blob the SSR layout writes into the document head.
 * Store-selection mappings and cleanup policy are also server-only; clients need the enabled flag.
 */
export function extractClientConfig(app: AppConfig): ClientAppConfig {
    const out: Record<string, unknown> = { ...app };
    for (const key of SERVER_ONLY_NAMESPACES) {
        delete out[key];
    }
    if (app.features?.shopperContext) {
        const shopperContext = { ...app.features.shopperContext };
        delete shopperContext.storeSelection;
        out.features = { ...app.features, shopperContext };
    }
    return out as ClientAppConfig;
}
