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

declare module 'virtual:action-hooks' {
    interface ActionHookContext<T = unknown> {
        data: T;
        actionContext: unknown;
    }
    export function runHook<T = unknown>(
        hookId: string,
        context: ActionHookContext<T>,
        options?: { blocking?: boolean }
    ): Promise<ActionHookContext<T>>;
}

declare module 'virtual:storefront-next/page-designer-preload-manifest' {
    import type { PageDesignerPreloadManifest } from '@salesforce/storefront-next-runtime/design/preload';
    const manifest: PageDesignerPreloadManifest;
    export default manifest;
}
