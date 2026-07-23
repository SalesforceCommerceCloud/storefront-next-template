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

// Attribute types supported by B2C Commerce
// Based on official schema: https://salesforcecommercecloud.github.io/b2c-dev-doc/docs/current/content/attributedefinition.json
// Define the array first as the single source of truth
export const VALID_ATTRIBUTE_TYPES = [
    'string',
    'text',
    'markup',
    'integer',
    'boolean',
    'product',
    'category',
    'file',
    'page',
    'image',
    'url',
    'enum',
    'custom',
    'cms_record',
] as const;

// Derive the union type from the array
export type AttributeType = (typeof VALID_ATTRIBUTE_TYPES)[number];

/**
 * Configuration interface for the AttributeDefinition decorator
 * Matches the AttributeDefinition interface from component-registry.ts
 */
/**
 * Search-index configuration for an attribute (maps to the `searching` object in the
 * Page Designer metadefinition schema). Not every attribute type supports searching, and
 * some types narrow which sub-fields are allowed — the cartridge generator validates the
 * combination and fails generation if it is invalid:
 *  - `string` | `text` | `product` | `category`: all fields allowed.
 *  - `markup`: `sortable` must be omitted or `false`.
 *  - `custom` | `cms_record`: `refinable` must be `false`; `boostFactor`/`sortable` not allowed.
 *  - `integer` | `boolean` | `file` | `page` | `image` | `url` | `enum`: searching not allowed.
 */
export interface AttributeSearchingConfig {
    searchable: boolean; // Whether the attribute is indexed for full-text search
    refinable: boolean; // Whether the attribute can be used as a search refinement (facet)
    boostFactor?: number; // Relevance boost applied to matches (0.01–100)
    sortable?: boolean; // Whether search results can be sorted by this attribute
}

/**
 * Dynamic-lookup configuration for an attribute (maps to the `dynamic_lookup` object in the
 * Page Designer metadefinition schema). Sources the attribute's value from an aspect attribute
 * at render time instead of a stored value. Allowed on all attribute types.
 */
export interface AttributeDynamicLookupConfig {
    aspectAttributeAlias: string; // Alias of the aspect attribute to source the value from
}

export interface AttributeDefinitionConfig {
    id?: string; // Unique identifier for the attribute
    name?: string; // Human-readable name for the attribute
    description?: string; // Optional description of the attribute
    type?: AttributeType; // Type of the attribute
    required?: boolean; // Whether the attribute is required
    values?: string[]; // Values for enum types
    defaultValue?: unknown; // Default value for the attribute
    editorDefinition?: {
        // Custom editor definition for 'custom' type attributes
        type: string;
        configuration?: Record<string, unknown>;
    };
    searching?: AttributeSearchingConfig; // Search-index configuration (type-gated; see AttributeSearchingConfig)
    dynamicLookup?: AttributeDynamicLookupConfig; // Source value from an aspect attribute (see AttributeDynamicLookupConfig)
}

/**
 * Decorator for marking class fields and method parameters with attribute definition metadata
 *
 * @param config - Attribute definition configuration matching the AttributeDefinition interface
 *
 * @example
 * ```typescript
 * class MyComponent {
 *   @AttributeDefinition({
 *     id: 'title',
 *     name: 'Title',
 *     type: 'string',
 *     required: true,
 *     description: 'The main title text'
 *   })
 *   title: string;
 *
 *   @AttributeDefinition({
 *     id: 'theme',
 *     name: 'Theme',
 *     type: 'enum',
 *     required: false,
 *     values: ['light', 'dark'],
 *     defaultValue: 'light',
 *     description: 'Visual theme for the component'
 *   })
 *   theme: 'light' | 'dark';
 *
 *   // `searching` is type-gated — see AttributeSearchingConfig for which types allow it.
 *   @AttributeDefinition({
 *     id: 'headline',
 *     name: 'Headline',
 *     type: 'string',
 *     searching: { searchable: true, refinable: true, boostFactor: 1.5 }
 *   })
 *   headline: string;
 *
 *   // `dynamicLookup` sources the value from an aspect attribute at render time.
 *   @AttributeDefinition({
 *     id: 'productName',
 *     name: 'Product Name',
 *     type: 'string',
 *     dynamicLookup: { aspectAttributeAlias: 'product' }
 *   })
 *   productName: string;
 *
 *   constructor(
 *     @AttributeDefinition({
 *       id: 'imageUrl',
 *       name: 'Image URL',
 *       type: 'url',
 *       required: true,
 *       description: 'URL of the image to display'
 *     })
 *     imageUrl: string
 *   ) {
 *     this.imageUrl = imageUrl;
 *   }
 * }
 * ```
 */
export function AttributeDefinition(config?: AttributeDefinitionConfig) {
    // The legacy property/parameter decorator signature receives either the prototype
    // (instance members) or the constructor (static members) as `target` — both are objects.
    return function (target: object, propertyKey: string | symbol | undefined, parameterIndex?: number) {
        // Handle method parameter decorators
        if (typeof parameterIndex === 'number') {
            const existingParams =
                (Reflect.getMetadata('attribute:parameters', target) as AttributeDefinitionConfig[] | undefined) ?? [];
            existingParams[parameterIndex] = config as AttributeDefinitionConfig;
            Reflect.defineMetadata('attribute:parameters', existingParams, target);
            return;
        }

        // Handle class field decorators
        if (propertyKey) {
            const existingFields =
                (Reflect.getMetadata('attribute:fields', target) as
                    | Record<string | symbol, AttributeDefinitionConfig>
                    | undefined) ?? {};
            existingFields[propertyKey] = config as AttributeDefinitionConfig;
            Reflect.defineMetadata('attribute:fields', existingFields, target);
        }
    };
}

/**
 * Helper function to get attribute definitions from a class
 *
 * @param target - The class constructor or instance
 * @returns Object containing field and parameter attribute definitions
 */
export function getAttributeDefinitions(target: unknown): {
    fields: Record<string, AttributeDefinitionConfig>;
    parameters: AttributeDefinitionConfig[];
} {
    const fields =
        (Reflect.getMetadata('attribute:fields', target as object) as
            | Record<string, AttributeDefinitionConfig>
            | undefined) ?? {};
    const parameters =
        (Reflect.getMetadata('attribute:parameters', target as object) as AttributeDefinitionConfig[] | undefined) ??
        [];

    return { fields, parameters };
}

/**
 * Helper function to get all attribute definitions as a flat array
 *
 * @param target - The class constructor or instance
 * @returns Array of all attribute definitions
 */
export function getAllAttributeDefinitions(target: unknown): AttributeDefinitionConfig[] {
    const { fields, parameters } = getAttributeDefinitions(target);

    return [
        ...Object.values(fields),
        ...parameters.filter(Boolean), // Filter out undefined entries
    ];
}
