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
// Default export: Vite plugin (for tree-shaking, consumers won't bundle CLI code)
export { storefrontNextTargets as default, type StorefrontNextTargetsConfig } from './storefront-next-targets';

// Named export: Transform target placeholder components (UITarget & UITargetProviders)
export { transformTargetPlaceholderPlugin } from './plugins/transformTargets';

// Named export: Target dev mode plugin (DEPRECATED — no-op for backward compatibility)
export { uiTargetDevModePlugin, type UITargetDevModeConfig } from './plugins/uiTargetDevMode';

// Named export: Hybrid proxy plugin for local development against legacy SFRA
export { hybridProxyPlugin, type HybridProxyPluginOptions } from './plugins/hybridProxy';

// Named export: eCDN routing rule matcher (injected into hybridProxyPlugin as routeMatcher)
export { shouldRouteToNext } from './plugins/ecdnMatcher';

// Named export: default MRT bundle config (ssrOnly/ssrShared/ssrParameters) merged with `config.server.ts` overrides
export { buildMrtSsrConfig } from './config';
