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
 * Server entry composition function.
 *
 * Wraps the full ServerEntryModule (the customer's or SDK default entry.server)
 * with platform-level features. The Vite plugin (platformEntryPlugin) generates
 * a virtual module that imports this function and calls it with the app's entry
 * module. New platform features ship via `npm update` without changes to the
 * plugin or customer code.
 *
 * Current platform behaviors:
 * - OpenTelemetry instrumentation for request lifecycle tracing
 *
 * Future additions:
 * - loadContext enrichment (correlation IDs, platform metadata)
 * - Response header injection (tracing, cache directives)
 * - Default error handling with platform error reporting
 */

import type { ServerEntryModule } from 'react-router';
import { platformInstrumentation } from '../otel/react-router/instrumentation';

/**
 * Composes a server entry module with platform-level features.
 *
 * - Spreads all app module properties to forward unknown/future exports
 * - Wraps the default handler for platform-level processing
 * - Prepends a platform instrumentation to instrumentations
 */
export function composeServerEntry(appModule: ServerEntryModule): ServerEntryModule {
    // React Router 7.18 reads the server-entry `instrumentations` export by name,
    // so an ejected entry still exporting the pre-stabilization `unstable_instrumentations`
    // compiles fine but is never registered. Surface that in dev so it doesn't ship silently.
    if (
        process.env.NODE_ENV !== 'production' &&
        'unstable_instrumentations' in appModule &&
        !('instrumentations' in appModule)
    ) {
        // oxlint-disable-next-line no-console
        console.warn(
            '[storefront-next] entry.server exports `unstable_instrumentations`, which React Router 7.18 ' +
                'no longer reads. Rename the export to `instrumentations` or it will not register.'
        );
    }
    return {
        // Spread all properties first so unknown/future exports pass through
        ...appModule,
        // Override the exports the platform layer enhances
        default(request, statusCode, headers, context, loadContext) {
            return appModule.default(request, statusCode, headers, context, loadContext);
        },
        instrumentations: [platformInstrumentation, ...(appModule.instrumentations ?? [])],
    };
}
