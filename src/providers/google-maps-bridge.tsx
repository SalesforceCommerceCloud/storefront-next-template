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
 * @module google-maps-bridge
 *
 * This module is **only ever imported dynamically** via:
 *   `import('./google-maps-bridge')`
 *
 * It may freely import from @vis.gl/react-google-maps because it is never
 * included in the initial bundle — only fetched on-demand after the first
 * address-field interaction.
 */
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps';
import { useEffect } from 'react';
import type { PlacesLibrary } from './google-maps-context';

export { APIProvider };

/**
 * Bridge component that must live inside an @vis.gl APIProvider.
 *
 * Reads the 'places' library via useMapsLibrary and forwards it to the
 * GoogleCloudApiProvider through the onLoad callback so that the provider
 * can publish it through GoogleMapsContext — without wrapping or remounting
 * the checkout children tree.
 */
export function MapsLibraryBridge({ onLoad }: { onLoad: (places: PlacesLibrary) => void }) {
    const places = useMapsLibrary('places') as PlacesLibrary | null;

    useEffect(() => {
        if (places) {
            onLoad(places);
        }
    }, [places, onLoad]);

    return null;
}
