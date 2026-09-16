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
import { createContext, useContext } from 'react';
import type { ClientApi } from '../../messaging-api';

/**
 * Tokens for the Preview Context. Kept in `core/` so lightweight consumers
 * (`usePreviewContext`) can be imported by the shopper-facing template without
 * dragging `PreviewProvider` — and its `createClientApi` dependency — into the
 * main bundle. The runtime provider lives in `../context/PreviewContext`.
 */
export interface PreviewContextType {
    /** Whether preview mode is currently active */
    isPreviewMode: boolean;
    /** Client API for host communication. Undefined until the provider has mounted. */
    clientApi?: ClientApi;
    /** Whether the client is connected to the host. */
    isConnected: boolean;
    /**
     * Emits a `ClientRouteChanged` event to the host with the current URL.
     * A no-op outside a `PreviewProvider`. Mirrors `setClientPage` on
     * `DesignContext`, which fires `ClientPageChanged`.
     */
    notifyClientRouteChanged: (url: string) => void;
}

const noop = () => {
    /* noop */
};

export const PreviewContext = createContext<PreviewContextType>({
    isPreviewMode: false,
    isConnected: false,
    notifyClientRouteChanged: noop,
});

export const usePreviewContext = (): PreviewContextType => useContext(PreviewContext);
