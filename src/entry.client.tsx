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
 * Custom client entry. Mirrors the `@react-router/dev` default
 * (node_modules/@react-router/dev/dist/config/defaults/entry.client.tsx) but
 * DEFERS `hydrateRoot` until the active language's translations have loaded.
 *
 * Why: the server renders translated text, but the client i18next instance loads
 * translations asynchronously. If React hydrates before that resolves, the first
 * client render shows keys/fallbacks — a text mismatch vs. the SSR HTML — which
 * React reports as a hydration error (and regenerates the tree client-side).
 * Awaiting readiness first makes the initial client render match the server.
 *
 * This adds no bytes to the document (unlike inlining the bundle); it only reorders
 * client startup: load initial-language chunk → hydrate. React Router's deferred-
 * data stream is a buffered ReadableStream fed by parse-time inline scripts, so it
 * is not lost while hydration waits. `whenI18nReady()` resolves-or-times-out, so a
 * slow/failed locale load still hydrates rather than hanging.
 */
import { startTransition, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';
import { whenI18nReady } from '@/i18n-client-init';

void whenI18nReady().then(() => {
    startTransition(() => {
        hydrateRoot(
            document,
            <StrictMode>
                <HydratedRouter />
            </StrictMode>
        );
    });
});
