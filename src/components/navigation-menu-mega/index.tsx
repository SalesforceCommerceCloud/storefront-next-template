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
import type { ReactElement } from 'react';
import { Component } from '@/lib/decorators/component';
import { RegionDefinition } from '@/lib/decorators';
import { getRegionIds } from '@/lib/decorators/region-definition';
import ResponsiveNavigationMenuEngine, {
    type ResponsiveNavigationMenuProps as ResponsiveNavigationMenuPropsBase,
    resolveMegaMenuRegionId as resolveMegaMenuRegionIdEngine,
    useMobileMenu as useMobileMenuEngine,
    MobileMenuDropdown as MobileMenuDropdownEngine,
    regionHasContent as regionHasContentEngine,
    categoryHasBanner as categoryHasBannerEngine,
} from './responsive-navigation-menu';

@Component('megaMenu', {
    name: 'Mega Menu',
    group: 'Layout',
    description: 'Site-wide mega menu with per-category dropdown panel content slots',
    embedded: true,
    component_id: 'mega-menu',
})
@RegionDefinition([
    // One region per top-level category, keyed by category id via the `region_<id>` convention.
    // Edit this list to match your catalog's top-level category ids. Must stay an array literal —
    // the cartridge generator extracts regions via AST and only handles array-literal arguments.
    { id: 'region_women', name: 'Women' },
    { id: 'region_men', name: 'Men' },
    { id: 'region_kids', name: 'Kids' },
])
// oxlint-disable-next-line react-refresh/only-export-components
export class MegaMenuMetadata {}

/**
 * Declared mega-menu region ids, derived from the `@RegionDefinition` decorator above so the
 * decorator list is the single source of truth. A top-level category renders its region when
 * `region_${category.id}` is present in this set.
 */
export const MEGA_MENU_REGION_IDS: ReadonlySet<string> = new Set(getRegionIds(MegaMenuMetadata));

/**
 * Resolves the embedded-component region id for a top-level category, or `undefined` when the
 * category has no mapped region (no embedded component, no category id, or the derived
 * `region_${categoryId}` is not declared in {@link MEGA_MENU_REGION_IDS}). Pure and exported so the
 * per-category mapping can be unit-tested without mounting the lazily-rendered dropdown panel.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function resolveMegaMenuRegionId(
    categoryId: string | undefined,
    hasEmbeddedComponent: boolean,
    regionIds: ReadonlySet<string> = MEGA_MENU_REGION_IDS
): string | undefined {
    return resolveMegaMenuRegionIdEngine(categoryId, hasEmbeddedComponent, regionIds);
}

// eslint-disable-next-line react-refresh/only-export-components
export const useMobileMenu = useMobileMenuEngine;

// eslint-disable-next-line react-refresh/only-export-components
export const regionHasContent = regionHasContentEngine;

// eslint-disable-next-line react-refresh/only-export-components
export const categoryHasBanner = categoryHasBannerEngine;

export const MobileMenuDropdown = MobileMenuDropdownEngine;

// All configuration is handled internally with MEGA_MENU_REGION_IDS
export type ResponsiveNavigationMenuProps = Omit<
    ResponsiveNavigationMenuPropsBase,
    'regionIds' | 'portalSlots' | 'categoryFilter' | 'hasBanner' | 'utilityContent'
>;

/**
 * ResponsiveNavigationMenu - A unified responsive navigation component
 *
 * This component uses CSS and Tailwind to adapt the same navigation structure
 * for both mobile and desktop:
 * - On mobile (< 1024px): Hamburger button with expandable vertical menu
 * - On desktop (>= 1024px): Horizontal mega menu with dropdown navigation
 *
 * The component renders a single navigation structure with responsive classes
 * controlling layout, visibility, and interaction patterns. This minimizes DOM bloat
 * while maintaining SSR compatibility.
 *
 * @param props - Component props
 * @param props.resolve - Promise resolving to root categories and first-level subcategories
 * @param props.defer - Promise resolving to deeper subcategory data for prefetch
 * @param props.embeddedComponent - Optional Page Designer 'mega-menu' component data
 * @returns A responsive navigation component with CSS-controlled responsive behavior
 */
export default function ResponsiveNavigationMenu(props: ResponsiveNavigationMenuProps): ReactElement {
    return <ResponsiveNavigationMenuEngine {...props} regionIds={MEGA_MENU_REGION_IDS} />;
}
