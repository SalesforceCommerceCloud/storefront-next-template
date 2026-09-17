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

import type { CspContributor, CspContribution } from '@salesforce/storefront-next-runtime/security';

/**
 * No-op CSP contributor for boutique map tiles (OpenStreetMap raster tiles).
 *
 * The `tile.openstreetmap.org` origin is only needed by a storefront that renders the boutique map,
 * so it must not widen every storefront's CSP, and it cannot be gated on a build-time environment
 * variable (unset in the deployed runtime artifact, which would leave the tiles CSP-blocked). A brand
 * that renders the map provides its own always-active override of this module instead.
 */
export function createOpenStreetMapCspContributor(): CspContributor {
    return {
        id: 'openstreetmap-embed',
        isActive: () => false,
        contribute: (): CspContribution => ({}),
    };
}
