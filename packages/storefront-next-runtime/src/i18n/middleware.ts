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
import { initReactI18next } from 'react-i18next';
// NOTE: this dep is pre-bundled by the dev Vite plugin. The template reaches this
// module via the `/i18n` barrel (e.g. getTranslation) rather than importing
// `remix-i18next/middleware` directly, so Vite discovers it late (triggering a
// re-optimize + reload). It is listed in `optimizeDeps.include` in
// storefront-next-dev/src/plugins/baseConfig.ts — keep that list in sync if this
// import is renamed or removed.
import { createI18nextMiddleware } from 'remix-i18next/middleware';
import { type MiddlewareFunction } from 'react-router';
import { requestToLocaleMap } from '../site-context/index.js';
import { defaultInterpolation } from './defaults.js';
import { i18nextContext } from './context.js';
import type { I18nMiddlewareConfig } from './types.js';

/**
 * Creates a server-side i18next middleware from the provided config.
 * Lazy-initializes on first request so supported languages can come from runtime config.
 */
export function createI18nMiddleware(config: I18nMiddlewareConfig): MiddlewareFunction<Response> {
    const { resources, supportedLanguages, fallbackLanguage, interpolation, plugins = [] } = config;

    let cached: ReturnType<typeof createI18nextMiddleware> | null = null;

    return async (args, next) => {
        if (!cached) {
            cached = createI18nextMiddleware({
                detection: {
                    order: ['custom'],
                    // oxlint-disable-next-line @typescript-eslint/require-await
                    findLocale: async (request: Request) => {
                        const localeId = requestToLocaleMap.get(request);
                        return localeId ?? null;
                    },
                    fallbackLanguage,
                    supportedLanguages,
                },
                i18next: {
                    resources,
                    interpolation: { ...defaultInterpolation, ...interpolation },
                },
                plugins: [initReactI18next, ...plugins],
            });
        }

        const [originalMiddleware, getLocale, getInstance] = cached;

        args.context.set(i18nextContext, {
            getLocale: () => getLocale(args.context),
            getI18nextInstance: () => getInstance(args.context),
        });

        return originalMiddleware(args, next);
    };
}
