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

function getMarkerId(componentId: string, componentTypeId: string): string {
    return `page-designer-critical-component-${encodeURIComponent(`${componentId}:${componentTypeId}`)}`;
}

export function CriticalRegionProvider({ children }: { children: ReactNode }) {
    return <CriticalRegionContext.Provider value={true}>{children}</CriticalRegionContext.Provider>;
}

// oxlint-disable-next-line react-refresh/only-export-components
export function useIsInCriticalRegion(): boolean {
    return useContext(CriticalRegionContext);
}

// oxlint-disable-next-line react-refresh/only-export-components
export function useWasServerRendered(componentId: string, componentTypeId: string): boolean {
    const isInCriticalRegion = useIsInCriticalRegion();
    const markerId = getMarkerId(componentId, componentTypeId);
    const [serverMarkerId] = useState(() => {
        if (!isInCriticalRegion) return undefined;
        if (import.meta.env.SSR) return markerId;
        return typeof document !== 'undefined' && document.getElementById(markerId) ? markerId : undefined;
    });
    return serverMarkerId === markerId;
}

export function CriticalComponentHydrationMarker({
    componentId,
    componentTypeId,
    requiresRegistration,
}: {
    componentId: string;
    componentTypeId: string;
    requiresRegistration: boolean;
}) {
    return (
        <template
            id={getMarkerId(componentId, componentTypeId)}
            data-page-designer-component-type={requiresRegistration ? componentTypeId : undefined}
        />
    );
}
