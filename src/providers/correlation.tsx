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
import { createContext, useContext, useState, useEffect, useRef, type PropsWithChildren } from 'react';
import { useLocation } from 'react-router';
import { generateCorrelationId } from '@/lib/correlation';

/**
 * React context for correlation ID (component-scoped, used in React components)
 */
const CorrelationReactContext = createContext<string | undefined>(undefined);

/**
 * Provider that maintains the correlation ID across navigations.
 *
 * ## Design Purpose
 *
 * This provider handles correlation ID management for both server and client loaders.
 * The primary design goal is to ensure a valid correlation ID is always available,
 * even when a route uses a clientLoader that doesn't explicitly return one.
 *
 * ## Why This Design?
 *
 * Server loaders always receive a correlation ID from the server middleware
 * (correlation.server.ts). However, client loaders may not return a correlation ID
 * because:
 * 1. The developer forgot to include it in the return value
 * 2. The clientLoader doesn't call serverLoader() and has no access to the server-generated ID
 *
 * Rather than requiring every developer to remember to handle correlation IDs in their
 * clientLoaders, this provider automatically generates a new ID when one isn't provided
 * during client-side navigations.
 *
 * ## Behavior
 *
 * | Scenario                              | Behavior                          |
 * |---------------------------------------|-----------------------------------|
 * | Initial SSR + hydration               | Keeps server-generated ID         |
 * | Navigation with server loader         | Uses server-generated ID          |
 * | Navigation with clientLoader (w/ ID)  | Uses the provided ID              |
 * | Navigation with clientLoader (no ID)  | Auto-generates a new ID           |
 *
 * ## Implementation Note
 *
 * We use location tracking to distinguish between:
 * - Hydration: Location stays the same, but value changes to undefined (from clientLoader)
 * - Navigation: Location changes, value might be undefined (clientLoader without ID)
 *
 * This prevents generating a new ID during hydration when the root clientLoader
 * (with hydrate=true) runs and returns undefined for correlationId.
 */
export function CorrelationProvider({ value, children }: PropsWithChildren<{ value: string | null }>) {
    const location = useLocation();
    const [correlationId, setCorrelationId] = useState<string | undefined>(value ?? undefined);

    // Track the previous location to detect actual navigations vs hydration.
    //
    // Why location tracking?
    // When a route uses `clientLoader.hydrate = true`, the clientLoader runs immediately
    // after hydration on the same URL. If that clientLoader doesn't return correlationId,
    // the value becomes undefined. Without location tracking, we would incorrectly
    // generate a new ID during hydration instead of preserving the server-rendered one.
    const previousLocationRef = useRef(location.pathname + location.search);

    useEffect(() => {
        const currentLocation = location.pathname + location.search;
        const isNavigation = currentLocation !== previousLocationRef.current;
        previousLocationRef.current = currentLocation;

        if (value) {
            // A loader explicitly provided a correlation ID - use it.
            // This handles:
            // - Server loaders (always have correlationId from middleware)
            // - Client loaders that explicitly return correlationId
            setCorrelationId(value);
        } else if (isNavigation) {
            // URL changed (actual navigation) but the clientLoader didn't return correlationId.
            // Generate a new ID so components have a valid correlation ID for this navigation.
            setCorrelationId(generateCorrelationId());
        }
        // If URL hasn't changed and value is undefined, this is the hydration case
        // (clientLoader.hydrate = true running after SSR). Preserve the server-rendered
        // correlation ID - don't generate a new one.
    }, [value, location.pathname, location.search]);

    return <CorrelationReactContext.Provider value={correlationId}>{children}</CorrelationReactContext.Provider>;
}

/**
 * React hook to get correlation ID from context (for use in components).
 * @returns The current correlation ID or undefined
 */
// oxlint-disable-next-line react-refresh/only-export-components
export function useCorrelationId(): string | undefined {
    return useContext(CorrelationReactContext);
}
