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
import type { RequestHandler } from 'express';

/**
 * Registry for custom **Express** server middlewares.
 *
 * This file configures the Node/Express HTTP layer (proxy, redirects, cookies, etc.).
 * It is not for React Router middlewares (auth, basket, i18n, etc.). For those, see
 * the `middleware` and `clientMiddleware` exports in `root.tsx`.
 *
 * Extensions can add Express middlewares here; the framework applies them in order
 * before the React Router SSR handler.
 *
 * Note: This file and the middleware modules it imports are loaded only at server startup.
 * Restart the dev server to pick up edits to this file or to any of the imported middleware
 * implementations; hot reload does not apply here.
 */
export interface CustomMiddlewareEntry {
    handler: RequestHandler;
}

export const customMiddlewares: CustomMiddlewareEntry[] = [];
