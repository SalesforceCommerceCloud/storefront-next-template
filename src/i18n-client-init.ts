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
 * Client-side i18next initialization, extracted from `root.tsx` so the hydration
 * entry (`entry.client.tsx`) can await translation readiness before calling
 * `hydrateRoot`.
 *
 * Why gate hydration on i18n:
 * The server renders with all translations loaded, so the SSR HTML contains real
 * translated text. On the client, `initI18next` uses an ASYNC dynamic-import
 * backend with no preloaded resources, so at the moment React would hydrate,
 * `t()` still returns keys/fallbacks — a text divergence from the server HTML
 * that React reports as a hydration mismatch. Awaiting the initial-language load
 * before hydrating makes the FIRST client render match the server, fixing the
 * mismatch WITHOUT inlining the translation bundle into the document (which would
 * inflate document transfer size / Lighthouse `resource-summary:document:size`).
 */
import type { i18n } from 'i18next';
import { initI18next } from '@salesforce/storefront-next-runtime/i18n/client';

/**
 * Max time (ms) `whenI18nReady()` will wait for the initial-language chunk before
 * hydrating anyway. A brief translated-text flash on an unusually slow/failed
 * locale load is preferable to a hung, non-interactive page. On timeout we fall
 * back to the pre-existing behavior (hydrate while i18n is still loading).
 */
const I18N_READY_TIMEOUT_MS = 3000;

/**
 * Client i18next instance. `undefined` during SSR (module also imported on the
 * server via `root.tsx`); created only in the browser.
 *
 * Language comes from the server-rendered `<html lang>` to avoid client-side
 * language detection diverging from the SSR locale.
 */
export const i18nextOnClient: i18n | undefined =
    typeof window !== 'undefined'
        ? initI18next({
              language: document.documentElement.lang || undefined,
              // The import() must live here so Vite can resolve the path at build
              // time and split translations into per-language chunks.
              loadLocale: (language) => import(`@/locales/${language}/index.ts`),
          })
        : undefined;

/**
 * Resolves once the active language's translations are loaded into
 * `i18nextOnClient` (or after {@link I18N_READY_TIMEOUT_MS} as a safety net).
 * Always resolves — never rejects — so a locale load error still lets hydration
 * proceed.
 *
 * Loading a single namespace is sufficient: the template's locale barrel merges
 * every namespace into one module, so the backend's first `read()` populates the
 * whole language via `addResourceBundle`. i18next's `hasLoadedNamespace` then
 * returns true for every namespace once the bundle is in the store
 * (`hasResourceBundle` short-circuit), so `useTranslation` is `ready` on the
 * first render for all namespaces.
 */
export function whenI18nReady(): Promise<void> {
    const instance = i18nextOnClient;
    if (!instance) return Promise.resolve();

    const loaded = instance.hasResourceBundle(instance.language, 'common');
    if (loaded) return Promise.resolve();

    return new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve();
        };

        const timer = setTimeout(finish, I18N_READY_TIMEOUT_MS);

        // loadNamespaces triggers the dynamic-import backend for the active
        // language; its callback fires once the bundle is added to the store.
        void instance.loadNamespaces('common', finish);
    });
}
