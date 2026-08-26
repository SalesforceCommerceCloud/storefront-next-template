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
import type { ShopperExperience } from '@/scapi';

export interface ComponentIdentifiers {
    typeIds: Set<string>;
    componentIds: Set<string>;
}

/** Collect every component in a region, including components in nested regions. */
export function collectComponentIdentifiers(
    region: ShopperExperience.schemas['Region'] | undefined
): ComponentIdentifiers {
    const typeIds = new Set<string>();
    const componentIds = new Set<string>();

    const visitRegions = (regions: ShopperExperience.schemas['Region'][] | undefined): void => {
        for (const nestedRegion of regions ?? []) {
            for (const component of nestedRegion.components ?? []) {
                typeIds.add(component.typeId);
                componentIds.add(component.id);
                visitRegions(component.regions);
            }
        }
    };

    if (region) visitRegions([region]);
    return { typeIds, componentIds };
}
