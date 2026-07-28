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
import 'reflect-metadata';
import { DEFAULT_COMPONENT_GROUP, META_KEY, type ComponentTypeMetadata } from '@/lib/decorators/component';

export const REGION_DEFINITIONS_KEY = 'region:definitions';

// Default component constructor interface
export interface DefaultComponentConstructor {
    id: string; // Unique identifier for the component instance
    typeId: string; // Component type ID to instantiate
    data: Record<string, unknown>; // Component data/attributes
}

/**
 * Configuration interface for the RegionDefinition decorator
 * Matches the RegionDefinition interface from component-registry.ts
 */
export interface RegionDefinitionConfig {
    id: string; // Unique identifier for the region
    name: string; // Human-readable name for the region
    description?: string; // Optional description for the region
    maxComponents?: number; // Maximum number of components allowed in the region
    componentTypeExclusions?: string[]; // Excluded component types
    componentTypeInclusions?: string[]; // Included component types
    defaultComponentConstructors?: DefaultComponentConstructor[]; // Default components to instantiate
}

function getConstructor(target: unknown): new (...args: unknown[]) => unknown {
    return (typeof target === 'function' ? target : (target as { constructor: typeof target }).constructor) as new (
        ...args: unknown[]
    ) => unknown;
}

function getHostResolvedGroup(constructor: new (...args: unknown[]) => unknown): string {
    const meta = Reflect.getMetadata(META_KEY, constructor) as ComponentTypeMetadata | undefined;
    return meta?.group ?? DEFAULT_COMPONENT_GROUP;
}

/**
 * Resolve a region type reference: fully-qualified ids (contain '.') are unchanged;
 * otherwise prefix with the host component's resolved group.
 */
export function resolveRegionComponentTypeRef(ref: string, hostGroup: string): string {
    return ref.includes('.') ? ref : `${hostGroup}.${ref}`;
}

function transformRegionConfigs(configs: RegionDefinitionConfig[], hostGroup: string): RegionDefinitionConfig[] {
    return configs.map((config) => ({
        ...config,
        componentTypeExclusions: config.componentTypeExclusions?.map((excl) =>
            resolveRegionComponentTypeRef(excl, hostGroup)
        ),
        componentTypeInclusions: config.componentTypeInclusions?.map((incl) =>
            resolveRegionComponentTypeRef(incl, hostGroup)
        ),
        defaultComponentConstructors: config.defaultComponentConstructors?.map((c) => ({
            ...c,
            typeId: resolveRegionComponentTypeRef(c.typeId, hostGroup),
        })),
    }));
}

/** Raw configs as authored (stored on the class by @RegionDefinition). */
function getRawRegionDefinitions(target: unknown): RegionDefinitionConfig[] {
    const ctor = getConstructor(target);
    const raw = Reflect.getMetadata(REGION_DEFINITIONS_KEY, ctor);
    return Array.isArray(raw) ? raw : [];
}

/**
 * Decorator for marking classes with region definition metadata
 * Used for container components that can hold other components in specific regions
 *
 * @param configs - Array of region definition configurations matching the RegionDefinition interface
 *
 * @example
 * ```typescript
 * @RegionDefinition([
 *   {
 *     id: 'main-content',
 *     name: 'Main Content Area',
 *     description: 'Primary content area for main page content',
 *     maxComponents: 10,
 *     componentTypeExclusions: ['header', 'footer'],
 *     componentTypeInclusions: ['hero', 'product-grid', 'text-block'],
 *     defaultComponentConstructors: [
 *       {
 *         id: 'default-hero',
 *         typeId: 'hero',
 *         data: {
 *           title: 'Welcome',
 *           subtitle: 'Discover our products'
 *         }
 *       }
 *     ]
 *   },
 *   {
 *     id: 'sidebar',
 *     name: 'Sidebar',
 *     maxComponents: 5,
 *     componentTypeInclusions: ['product-recommendations', 'promo-banner']
 *   }
 * ])
 * class MainContentRegion extends React.Component {
 *   // component implementation
 * }
 * ```
 */
export function RegionDefinition(configs: RegionDefinitionConfig[]) {
    // Class decorators must accept any constructor signature — `unknown[]` here would
    // reject classes whose constructors take typed args. This is the standard signature
    // used by TypeScript's class decorator types.
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    return function <T extends new (...args: any[]) => any>(constructor: T) {
        Reflect.defineMetadata(REGION_DEFINITIONS_KEY, configs, constructor);
        return constructor;
    };
}

/**
 * Helper function to get all region definitions from a class
 *
 * @param target - The class constructor or instance
 * @returns Array of region definition configurations
 */
export function getRegionDefinitions(target: unknown): RegionDefinitionConfig[] {
    const ctor = getConstructor(target);
    const raw = getRawRegionDefinitions(target);
    const hostGroup = getHostResolvedGroup(ctor);
    return transformRegionConfigs(raw, hostGroup);
}

/**
 * Helper function to get a specific region definition by ID from a class
 *
 * @param target - The class constructor or instance
 * @param regionId - The region ID to find
 * @returns Region definition configuration or undefined
 */
export function getRegionDefinition(target: unknown, regionId: string): RegionDefinitionConfig | undefined {
    const definitions = getRegionDefinitions(target);
    return definitions.find((def) => def.id === regionId);
}

/**
 * Helper function to get all region IDs from a class
 *
 * @param target - The class constructor or instance
 * @returns Array of region IDs
 */
export function getRegionIds(target: unknown): string[] {
    return getRawRegionDefinitions(target).map((config) => config.id);
}

/**
 * Helper function to get all region names from a class
 *
 * @param target - The class constructor or instance
 * @returns Array of region names
 */
export function getRegionNames(target: unknown): string[] {
    return getRawRegionDefinitions(target).map((config) => config.name);
}

/**
 * Helper function to get all component type exclusions from a class
 *
 * @param target - The class constructor or instance
 * @returns Array of component type exclusions
 */
export function getRegionExclusions(target: unknown): string[] {
    return getRegionDefinitions(target).flatMap((config) => config.componentTypeExclusions || []);
}

/**
 * Helper function to get component type exclusions for a specific region
 *
 * @param target - The class constructor or instance
 * @param regionId - The region ID to get exclusions for
 * @returns Array of component type exclusions for the specific region
 */
export function getRegionExclusionsForRegion(target: unknown, regionId: string): string[] {
    const definition = getRegionDefinition(target, regionId);
    return definition?.componentTypeExclusions || [];
}

/**
 * Helper function to get all component type inclusions from a class
 *
 * @param target - The class constructor or instance
 * @returns Array of component type inclusions
 */
export function getRegionInclusions(target: unknown): string[] {
    return getRegionDefinitions(target).flatMap((config) => config.componentTypeInclusions || []);
}

/**
 * Helper function to get component type inclusions for a specific region
 *
 * @param target - The class constructor or instance
 * @param regionId - The region ID to get inclusions for
 * @returns Array of component type inclusions for the specific region
 */
export function getRegionInclusionsForRegion(target: unknown, regionId: string): string[] {
    const definition = getRegionDefinition(target, regionId);
    return definition?.componentTypeInclusions || [];
}

/**
 * Helper function to get all default component constructors from a class
 *
 * @param target - The class constructor or instance
 * @returns Array of default component constructors
 */
export function getRegionDefaultConstructors(target: unknown): DefaultComponentConstructor[] {
    return getRegionDefinitions(target).flatMap((config) => config.defaultComponentConstructors || []);
}

/**
 * Helper function to get default component constructors for a specific region
 *
 * @param target - The class constructor or instance
 * @param regionId - The region ID to get default constructors for
 * @returns Array of default component constructors for the specific region
 */
export function getRegionDefaultConstructorsForRegion(
    target: unknown,
    regionId: string
): DefaultComponentConstructor[] {
    const definition = getRegionDefinition(target, regionId);
    return definition?.defaultComponentConstructors || [];
}

/**
 * Helper function to get max components for a specific region
 *
 * @param target - The class constructor or instance
 * @param regionId - The region ID to get max components for
 * @returns Maximum number of components allowed in the region, or undefined if not set
 */
export function getRegionMaxComponents(target: unknown, regionId: string): number | undefined {
    const definition = getRegionDefinition(target, regionId);
    return definition?.maxComponents;
}
