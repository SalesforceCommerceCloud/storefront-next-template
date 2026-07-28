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
import type { RegionDefinitionConfig } from '@/lib/decorators';

export const TYPE_ID_KEY = 'component:typeId';
export const META_KEY = 'component:metadata';
export const LOADER_KEY = 'component:loader';

/** Default cartridge group when `@Component` metadata omits `group` (must match storefront-next-dev generate-cartridge / staticRegistry). */
export const DEFAULT_COMPONENT_GROUP = 'storefrontnext_base';

type ComponentId = string;

/**
 * Metadata describing a component type.
 */
export interface ComponentTypeMetadata {
    id?: ComponentId;
    /** Human-readable name */
    name?: string;
    /** Component description */
    description?: string;
    /** Component group/category */
    group?: string;
    /** Region definitions of a component */
    regions?: RegionDefinitionConfig[];
    /** Whether this is an embedded content block (singleton, fetched independently via getComponent) */
    embedded?: boolean;
    /** Predictable instance ID for SCAPI getComponent fetch (requires embedded: true) */
    component_id?: string;
}

function defineComponentMetadata<T extends object>(typeId: string, metadata: ComponentTypeMetadata, target: T): T {
    const resolvedGroup = metadata.group ?? DEFAULT_COMPONENT_GROUP;
    const enrichedMetadata = {
        ...metadata,
        group: resolvedGroup,
    };
    const typeWithGroup = `${resolvedGroup}.${typeId}`;
    // Store metadata on the constructor
    Reflect.defineMetadata(TYPE_ID_KEY, typeWithGroup, target);
    Reflect.defineMetadata(META_KEY, enrichedMetadata, target);

    return target;
}

/**
 * Decorator for registering components with metadata
 *
 * @param typeId - Unique identifier for the component
 * @param metadata - Component metadata including attributes, description, etc.
 *
 * @example
 * ```typescript
 * @Component('hero', {
 *   name: 'Hero Banner',
 *   group: 'commerce_layouts',
 *   description: 'Prominent banner section with title, subtitle, image, and CTA'
 * })
 * export default class Hero extends React.Component<HeroProps> {
 *   // component implementation
 * }
 * ```
 */
export function Component(typeId: string, metadata: ComponentTypeMetadata) {
    // Class decorators must accept any constructor signature — `unknown[]` would reject
    // classes whose constructors take typed args. This matches TypeScript's class
    // decorator type pattern.
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    return function <T extends new (...args: any[]) => any>(constructor: T) {
        return defineComponentMetadata(typeId, metadata, constructor);
    };
}

/**
 * Decorator for function components that automatically registers them
 * This works by wrapping the function and adding metadata
 */
export function RegisterComponent(typeId: string, metadata: ComponentTypeMetadata) {
    // Function decorators must accept any callable signature — see the comment on
    // `Component` for why `any[]` is required here.
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    return function <T extends (...args: any[]) => any>(target: T): T {
        return defineComponentMetadata(typeId, metadata, target);
    };
}

/**
 * Higher-order component decorator that works with any constructor
 * This creates a wrapper that can be decorated
 */
// oxlint-disable-next-line @typescript-eslint/no-explicit-any
export function withComponentMetadata<T extends new (...args: any[]) => any>(
    typeId: string,
    metadata: ComponentTypeMetadata
) {
    return function (WrappedComponent: T): T {
        return defineComponentMetadata(typeId, metadata, WrappedComponent);
    };
}

/**
 * Decorator for marking component props with validation metadata.
 * The legacy property-decorator signature receives either the class prototype (instance
 * properties) or the constructor (static properties), so the target must be an object.
 */
export function Required(target: object, propertyKey: string) {
    const existingRequired = (Reflect.getMetadata('component:required', target) as string[] | undefined) ?? [];
    Reflect.defineMetadata('component:required', [...existingRequired, propertyKey], target);
}

export function Optional(target: object, propertyKey: string) {
    const existingOptional = (Reflect.getMetadata('component:optional', target) as string[] | undefined) ?? [];
    Reflect.defineMetadata('component:optional', [...existingOptional, propertyKey], target);
}
