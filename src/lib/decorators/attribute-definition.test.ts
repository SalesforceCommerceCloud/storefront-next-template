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
import { describe, test, expect } from 'vitest';
import 'reflect-metadata';
import {
    AttributeDefinition,
    getAttributeDefinitions,
    getAllAttributeDefinitions,
    VALID_ATTRIBUTE_TYPES,
} from './attribute-definition';

describe('AttributeDefinition Decorator', () => {
    describe('VALID_ATTRIBUTE_TYPES', () => {
        test('contains all expected attribute types', () => {
            expect(VALID_ATTRIBUTE_TYPES).toEqual([
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
            ]);
        });
    });

    describe('Field Decorators', () => {
        test('decorates class fields with attribute metadata', () => {
            class TestComponent {
                @AttributeDefinition({
                    id: 'title',
                    name: 'Title',
                    type: 'string',
                    required: true,
                    description: 'The title of the component',
                })
                title!: string;

                @AttributeDefinition({
                    id: 'subtitle',
                    name: 'Subtitle',
                    type: 'text',
                    required: false,
                })
                subtitle?: string;
            }

            const metadata = getAttributeDefinitions(TestComponent.prototype);

            expect(metadata.fields).toHaveProperty('title');
            expect(metadata.fields.title).toEqual({
                id: 'title',
                name: 'Title',
                type: 'string',
                required: true,
                description: 'The title of the component',
            });

            expect(metadata.fields).toHaveProperty('subtitle');
            expect(metadata.fields.subtitle).toEqual({
                id: 'subtitle',
                name: 'Subtitle',
                type: 'text',
                required: false,
            });
        });

        test('decorates fields without config', () => {
            class TestComponent {
                @AttributeDefinition()
                title!: string;
            }

            const metadata = getAttributeDefinitions(TestComponent.prototype);
            expect(metadata.fields).toHaveProperty('title');
            expect(metadata.fields.title).toBeUndefined();
        });

        test('handles enum type with values', () => {
            class TestComponent {
                @AttributeDefinition({
                    id: 'theme',
                    name: 'Theme',
                    type: 'enum',
                    values: ['light', 'dark', 'auto'],
                    defaultValue: 'light',
                })
                theme!: 'light' | 'dark' | 'auto';
            }

            const metadata = getAttributeDefinitions(TestComponent.prototype);
            expect(metadata.fields.theme).toEqual({
                id: 'theme',
                name: 'Theme',
                type: 'enum',
                values: ['light', 'dark', 'auto'],
                defaultValue: 'light',
            });
        });

        test('stores searching config on field metadata', () => {
            class TestComponent {
                @AttributeDefinition({
                    id: 'title',
                    name: 'Title',
                    type: 'string',
                    searching: { searchable: true, refinable: true, boostFactor: 2, sortable: false },
                })
                title!: string;
            }

            const metadata = getAttributeDefinitions(TestComponent.prototype);
            expect(metadata.fields.title?.searching).toEqual({
                searchable: true,
                refinable: true,
                boostFactor: 2,
                sortable: false,
            });
        });

        test('stores dynamicLookup config on field metadata', () => {
            class TestComponent {
                @AttributeDefinition({
                    id: 'productName',
                    name: 'Product Name',
                    type: 'string',
                    dynamicLookup: { aspectAttributeAlias: 'product' },
                })
                productName!: string;
            }

            const metadata = getAttributeDefinitions(TestComponent.prototype);
            expect(metadata.fields.productName?.dynamicLookup).toEqual({
                aspectAttributeAlias: 'product',
            });
        });

        test('handles image type attribute', () => {
            class TestComponent {
                @AttributeDefinition({
                    id: 'backgroundImage',
                    name: 'Background Image',
                    type: 'image',
                    required: false,
                })
                backgroundImage?: string;
            }

            const metadata = getAttributeDefinitions(TestComponent.prototype);
            expect(metadata.fields.backgroundImage?.type).toBe('image');
        });

        test('handles url type attribute', () => {
            class TestComponent {
                @AttributeDefinition({
                    id: 'ctaLink',
                    name: 'CTA Link',
                    type: 'url',
                    required: true,
                })
                ctaLink!: string;
            }

            const metadata = getAttributeDefinitions(TestComponent.prototype);
            expect(metadata.fields.ctaLink?.type).toBe('url');
        });

        test('handles integer type attribute', () => {
            class TestComponent {
                @AttributeDefinition({
                    id: 'maxItems',
                    name: 'Max Items',
                    type: 'integer',
                    defaultValue: 10,
                })
                maxItems!: number;
            }

            const metadata = getAttributeDefinitions(TestComponent.prototype);
            expect(metadata.fields.maxItems?.type).toBe('integer');
            expect(metadata.fields.maxItems?.defaultValue).toBe(10);
        });

        test('handles boolean type attribute', () => {
            class TestComponent {
                @AttributeDefinition({
                    id: 'isVisible',
                    name: 'Is Visible',
                    type: 'boolean',
                    defaultValue: true,
                })
                isVisible!: boolean;
            }

            const metadata = getAttributeDefinitions(TestComponent.prototype);
            expect(metadata.fields.isVisible?.type).toBe('boolean');
            expect(metadata.fields.isVisible?.defaultValue).toBe(true);
        });

        test('handles custom type with editor definition', () => {
            class TestComponent {
                @AttributeDefinition({
                    type: 'custom',
                    editorDefinition: {
                        type: 'einstein.globalrecommenderselector',
                    },
                })
                customField!: unknown;
            }

            const metadata = getAttributeDefinitions(TestComponent.prototype);
            expect(metadata.fields.customField?.type).toBe('custom');
            expect(metadata.fields.customField?.editorDefinition).toEqual({
                type: 'einstein.globalrecommenderselector',
            });
        });

        test('handles multiple fields on same class', () => {
            class TestComponent {
                @AttributeDefinition({ id: 'field1', name: 'Field 1' })
                field1!: string;

                @AttributeDefinition({ id: 'field2', name: 'Field 2' })
                field2!: string;

                @AttributeDefinition({ id: 'field3', name: 'Field 3' })
                field3!: string;
            }

            const metadata = getAttributeDefinitions(TestComponent.prototype);
            expect(Object.keys(metadata.fields)).toHaveLength(3);
            expect(metadata.fields).toHaveProperty('field1');
            expect(metadata.fields).toHaveProperty('field2');
            expect(metadata.fields).toHaveProperty('field3');
        });
    });

    describe('Parameter Decorators', () => {
        test('decorates constructor parameters', () => {
            class TestComponent {
                constructor(
                    @AttributeDefinition({
                        id: 'imageUrl',
                        name: 'Image URL',
                        type: 'url',
                        required: true,
                    })
                    public imageUrl: string
                ) {}
            }

            const metadata = getAttributeDefinitions(TestComponent);
            expect(metadata.parameters).toHaveLength(1);
            expect(metadata.parameters[0]).toEqual({
                id: 'imageUrl',
                name: 'Image URL',
                type: 'url',
                required: true,
            });
        });

        test('decorates multiple constructor parameters', () => {
            class TestComponent {
                constructor(
                    @AttributeDefinition({
                        id: 'title',
                        name: 'Title',
                        type: 'string',
                    })
                    public title: string,
                    @AttributeDefinition({
                        id: 'subtitle',
                        name: 'Subtitle',
                        type: 'text',
                    })
                    public subtitle: string,
                    @AttributeDefinition({
                        id: 'imageUrl',
                        name: 'Image URL',
                        type: 'url',
                    })
                    public imageUrl: string
                ) {}
            }

            const metadata = getAttributeDefinitions(TestComponent);
            expect(metadata.parameters).toHaveLength(3);
            expect(metadata.parameters[0]?.id).toBe('title');
            expect(metadata.parameters[1]?.id).toBe('subtitle');
            expect(metadata.parameters[2]?.id).toBe('imageUrl');
        });

        test('decorates method parameters', () => {
            class TestComponent {
                updateTitle(
                    @AttributeDefinition({
                        id: 'newTitle',
                        name: 'New Title',
                        type: 'string',
                    })
                    newTitle: string
                ) {
                    return newTitle;
                }
            }

            const metadata = getAttributeDefinitions(TestComponent.prototype);
            expect(metadata.parameters).toHaveLength(1);
            expect(metadata.parameters[0]?.id).toBe('newTitle');
        });
    });

    describe('getAttributeDefinitions', () => {
        test('returns empty objects when no decorators are present', () => {
            class TestComponent {
                title!: string;
            }

            const metadata = getAttributeDefinitions(TestComponent.prototype);
            expect(metadata.fields).toEqual({});
            expect(metadata.parameters).toEqual([]);
        });

        test('returns both fields and parameters', () => {
            class TestComponent {
                @AttributeDefinition({ id: 'field1', name: 'Field 1' })
                field1!: string;

                constructor(
                    @AttributeDefinition({ id: 'param1', name: 'Param 1' })
                    _param1: string
                ) {}
            }

            const metadata = getAttributeDefinitions(TestComponent);
            expect(Object.keys(metadata.fields)).toHaveLength(0); // Fields are on prototype
            expect(metadata.parameters).toHaveLength(1);

            const prototypeMetadata = getAttributeDefinitions(TestComponent.prototype);
            expect(Object.keys(prototypeMetadata.fields)).toHaveLength(1);
        });
    });

    describe('getAllAttributeDefinitions', () => {
        test('returns empty array when no decorators are present', () => {
            class TestComponent {
                title!: string;
            }

            const definitions = getAllAttributeDefinitions(TestComponent.prototype);
            expect(definitions).toEqual([]);
        });

        test('returns all field definitions as flat array', () => {
            class TestComponent {
                @AttributeDefinition({ id: 'field1', name: 'Field 1' })
                field1!: string;

                @AttributeDefinition({ id: 'field2', name: 'Field 2' })
                field2!: string;
            }

            const definitions = getAllAttributeDefinitions(TestComponent.prototype);
            expect(definitions).toHaveLength(2);
            expect(definitions[0]?.id).toBe('field1');
            expect(definitions[1]?.id).toBe('field2');
        });

        test('returns all parameter definitions as flat array', () => {
            class TestComponent {
                constructor(
                    @AttributeDefinition({ id: 'param1', name: 'Param 1' })
                    _param1: string,
                    @AttributeDefinition({ id: 'param2', name: 'Param 2' })
                    _param2: string
                ) {}
            }

            const definitions = getAllAttributeDefinitions(TestComponent);
            expect(definitions).toHaveLength(2);
            expect(definitions[0]?.id).toBe('param1');
            expect(definitions[1]?.id).toBe('param2');
        });

        test('combines fields and parameters in flat array', () => {
            class TestComponent {
                @AttributeDefinition({ id: 'field1', name: 'Field 1' })
                field1!: string;

                constructor(
                    @AttributeDefinition({ id: 'param1', name: 'Param 1' })
                    _param1: string
                ) {}
            }

            const fieldDefinitions = getAllAttributeDefinitions(TestComponent.prototype);
            expect(fieldDefinitions).toHaveLength(1);

            const paramDefinitions = getAllAttributeDefinitions(TestComponent);
            expect(paramDefinitions).toHaveLength(1);
        });

        test('filters out undefined entries from sparse parameter arrays', () => {
            class TestComponent {
                constructor(
                    _param0: string, // Not decorated
                    @AttributeDefinition({ id: 'param1', name: 'Param 1' })
                    _param1: string,
                    _param2: string, // Not decorated
                    @AttributeDefinition({ id: 'param3', name: 'Param 3' })
                    _param3: string
                ) {}
            }

            const definitions = getAllAttributeDefinitions(TestComponent);
            expect(definitions).toHaveLength(2);
            expect(definitions[0]?.id).toBe('param1');
            expect(definitions[1]?.id).toBe('param3');
        });
    });

    describe('Complex Scenarios', () => {
        test('handles inheritance with decorated fields', () => {
            class BaseComponent {
                @AttributeDefinition({ id: 'baseField', name: 'Base Field' })
                baseField!: string;
            }

            class DerivedComponent extends BaseComponent {
                @AttributeDefinition({ id: 'derivedField', name: 'Derived Field' })
                derivedField!: string;
            }

            const baseMetadata = getAttributeDefinitions(BaseComponent.prototype);
            expect(baseMetadata.fields.baseField).toBeDefined();
            expect(baseMetadata.fields.baseField?.id).toBe('baseField');

            const derivedMetadata = getAttributeDefinitions(DerivedComponent.prototype);
            // Derived prototype inherits base field metadata via prototype chain
            expect(derivedMetadata.fields.derivedField).toBeDefined();
            expect(derivedMetadata.fields.derivedField?.id).toBe('derivedField');
            // Metadata can accumulate on prototype chain, which is expected behavior
            expect(Object.keys(derivedMetadata.fields).length).toBeGreaterThanOrEqual(1);
        });

        test('handles all attribute types', () => {
            class TestComponent {
                @AttributeDefinition({ type: 'string' })
                stringField!: string;

                @AttributeDefinition({ type: 'text' })
                textField!: string;

                @AttributeDefinition({ type: 'markup' })
                markupField!: string;

                @AttributeDefinition({ type: 'integer' })
                integerField!: number;

                @AttributeDefinition({ type: 'boolean' })
                booleanField!: boolean;

                @AttributeDefinition({ type: 'product' })
                productField!: string;

                @AttributeDefinition({ type: 'category' })
                categoryField!: string;

                @AttributeDefinition({ type: 'file' })
                fileField!: string;

                @AttributeDefinition({ type: 'page' })
                pageField!: string;

                @AttributeDefinition({ type: 'image' })
                imageField!: string;

                @AttributeDefinition({ type: 'url' })
                urlField!: string;

                @AttributeDefinition({ type: 'enum' })
                enumField!: string;

                @AttributeDefinition({ type: 'custom' })
                customField!: unknown;

                @AttributeDefinition({ type: 'cms_record' })
                cmsRecordField!: string;
            }

            const metadata = getAttributeDefinitions(TestComponent.prototype);
            expect(Object.keys(metadata.fields)).toHaveLength(14);
            expect(metadata.fields.stringField?.type).toBe('string');
            expect(metadata.fields.textField?.type).toBe('text');
            expect(metadata.fields.markupField?.type).toBe('markup');
            expect(metadata.fields.integerField?.type).toBe('integer');
            expect(metadata.fields.booleanField?.type).toBe('boolean');
            expect(metadata.fields.productField?.type).toBe('product');
            expect(metadata.fields.categoryField?.type).toBe('category');
            expect(metadata.fields.fileField?.type).toBe('file');
            expect(metadata.fields.pageField?.type).toBe('page');
            expect(metadata.fields.imageField?.type).toBe('image');
            expect(metadata.fields.urlField?.type).toBe('url');
            expect(metadata.fields.enumField?.type).toBe('enum');
            expect(metadata.fields.customField?.type).toBe('custom');
            expect(metadata.fields.cmsRecordField?.type).toBe('cms_record');
        });
    });
});
