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

/**
 * Preview capability for a page type. A typed string literal so the set of supported preview
 * modes stays closed and type-checked at the decorator call site. More variants will be added
 * as the mini-PD preview surface grows.
 */
export type PageTypePreview = 'default';

/**
 * Configuration interface for the PageType decorator
 */
export interface PageTypeConfig {
    name: string; // Human-readable name for the page type
    description: string; // Description of the page type
    supportedAspectTypes: string[]; // Array of supported aspect types
    preview?: PageTypePreview; // When set, marks this page type as preview-capable; emitted into pagetype.json
}

/**
 * PageType decorator for marking page components with metadata
 * This decorator stores page type information that can be used for
 * page categorization, documentation, and SFCC integration.
 *
 * @param config - Configuration object containing page type metadata
 */
export function PageType(config: PageTypeConfig) {
    // The decorator returns the same target it was given. Class and function decorators
    // are both supported, so we constrain to a generic that accepts either.
    return function <T extends object>(target: T): T {
        // Store the page type metadata on the class/function
        Reflect.defineMetadata('page:type', config, target);

        return target;
    };
}

/**
 * Helper function to get page type metadata from a class or function
 *
 * @param target - The class constructor or function
 * @returns PageTypeConfig object or undefined if not found
 */
export function getPageTypeMetadata(target: unknown): PageTypeConfig | undefined {
    return Reflect.getMetadata('page:type', target as object) as PageTypeConfig | undefined;
}

/**
 * Helper function to get all page type definitions
 *
 * @param target - The class constructor or function
 * @returns Object containing page type metadata
 */
export function getPageTypeDefinitions(target: unknown): { pageType?: PageTypeConfig } {
    const pageType = Reflect.getMetadata('page:type', target as object) as PageTypeConfig | undefined;

    return { pageType };
}
