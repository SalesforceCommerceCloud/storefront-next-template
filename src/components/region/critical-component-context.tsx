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
import { createContext, useContext, useState, type ReactNode } from 'react';

const CriticalRegionContext = createContext(false);

function getMarkerId(componentId: string): string {
    return `pdc-${encodeURIComponent(componentId)}`;
}

export function CriticalRegionProvider({ children }: { children: ReactNode }) {
    return <CriticalRegionContext.Provider value={true}>{children}</CriticalRegionContext.Provider>;
}

// oxlint-disable-next-line react-refresh/only-export-components
export function useIsInCriticalRegion(): boolean {
    return useContext(CriticalRegionContext);
}

/** Whether this component instance is in the server HTML being hydrated, as identified by its marker. */
// oxlint-disable-next-line react-refresh/only-export-components
export function useWasServerRendered(componentId: string): boolean {
    const markerId = getMarkerId(componentId);
    const [serverMarkerId] = useState(() => {
        if (import.meta.env.SSR) return markerId;
        return typeof document !== 'undefined' && document.getElementById(markerId) ? markerId : undefined;
    });
    return serverMarkerId === markerId;
}

/**
 * Inert marker for a server-rendered component instance. Its ID identifies the instance during hydration, and its
 * type lets the client entry register the component before hydration, so the component renders in the first pass.
 */
export function ComponentHydrationMarker({
    componentId,
    componentTypeId,
}: {
    componentId: string;
    componentTypeId: string;
}) {
    return <template id={getMarkerId(componentId)} data-pdct={componentTypeId} />;
}
