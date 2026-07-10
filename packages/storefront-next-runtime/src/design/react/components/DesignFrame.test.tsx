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
import type React from 'react';
import { cleanup as tlCleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createComponentTestBed } from '../../test/component-test-bed';

// Test component to wrap DesignFrame
const TestComponent: React.FC<React.PropsWithChildren> = ({ children }) => (
    <div data-testid="test-component">{children}</div>
);

describe('DesignFrame', () => {
    const testBed = createComponentTestBed(() => ({}));

    afterEach(() => {
        vi.clearAllMocks();
        testBed.cleanup(() => tlCleanup());
    });

    describe('Localization Features', () => {
        it('should show fallback badge when component is not localized', async () => {
            const { element } = await testBed.render(TestComponent, {
                props: {
                    designMetadata: {
                        id: 'test-1',
                        contentLinkUuid: 'test-content-link-uuid',
                        isFragment: false,
                        isVisible: true,
                        isLocalized: false,
                    },
                },
                configFactory: () =>
                    Promise.resolve({
                        locale: 'en-US',
                        components: {
                            'test-1': {
                                id: 'test-1',
                                name: 'Test Component',
                                type: 'commerce.test',
                            },
                        },
                        componentTypes: {
                            'commerce.test': {
                                id: 'commerce.test',
                                name: 'Commerce Test',
                                label: 'Test Component Label',
                                image: 'test-image.png',
                            },
                        },
                        labels: {
                            fallback: 'Fallback',
                        },
                        regions: {},
                    }),
            });

            // Click to show the frame
            fireEvent.click(element);

            const fallbackBadge = await testBed.findBySelector(element, '.pd-design__frame__fallback-badge');
            expect(fallbackBadge.textContent).toBe('Fallback');
        });

        it('should not show fallback badge when component is localized', async () => {
            const { element } = await testBed.render(TestComponent, {
                props: {
                    designMetadata: {
                        id: 'test-1',
                        contentLinkUuid: 'test-content-link-uuid',
                        isFragment: false,
                        isVisible: true,
                        isLocalized: true,
                    },
                },
                configFactory: () =>
                    Promise.resolve({
                        locale: 'en-US',
                        components: {
                            'test-1': {
                                id: 'test-1',
                                name: 'Test Component',
                                type: 'commerce.test',
                            },
                        },
                        componentTypes: {
                            'commerce.test': {
                                id: 'commerce.test',
                                name: 'Commerce Test',
                                label: 'Test Component Label',
                                image: 'test-image.png',
                            },
                        },
                        labels: {
                            fallback: 'Fallback',
                        },
                        regions: {},
                    }),
            });

            // Click to show the frame
            fireEvent.click(element);

            const frame = await testBed.findBySelector(element, '.pd-design__frame');
            const fallbackBadge = frame.querySelector('.pd-design__frame__fallback-badge');
            expect(fallbackBadge).toBeNull();
        });

        it('should use custom fallback label from configuration', async () => {
            const { element } = await testBed.render(TestComponent, {
                props: {
                    designMetadata: {
                        id: 'test-1',
                        contentLinkUuid: 'test-content-link-uuid',
                        isFragment: false,
                        isVisible: true,
                        isLocalized: false,
                    },
                },
                configFactory: () =>
                    Promise.resolve({
                        locale: 'en-US',
                        components: {
                            'test-1': {
                                id: 'test-1',
                                name: 'Test Component',
                                type: 'commerce.test',
                            },
                        },
                        componentTypes: {
                            'commerce.test': {
                                id: 'commerce.test',
                                name: 'Commerce Test',
                                label: 'Test Component Label',
                                image: 'test-image.png',
                            },
                        },
                        labels: {
                            fallback: 'Custom Fallback Label',
                        },
                        regions: {},
                    }),
            });

            // Click to show the frame
            fireEvent.click(element);

            const fallbackBadge = await testBed.findBySelector(element, '.pd-design__frame__fallback-badge');
            expect(fallbackBadge.textContent).toBe('Custom Fallback Label');
        });

        it('should fallback to "Fallback" when no label is configured', async () => {
            const { element } = await testBed.render(TestComponent, {
                props: {
                    designMetadata: {
                        id: 'test-1',
                        contentLinkUuid: 'test-content-link-uuid',
                        isFragment: false,
                        isVisible: true,
                        isLocalized: false,
                    },
                },
                configFactory: () =>
                    Promise.resolve({
                        locale: 'en-US',
                        components: {
                            'test-1': {
                                id: 'test-1',
                                name: 'Test Component',
                                type: 'commerce.test',
                            },
                        },
                        componentTypes: {
                            'commerce.test': {
                                id: 'commerce.test',
                                name: 'Commerce Test',
                                label: 'Test Component Label',
                                image: 'test-image.png',
                            },
                        },
                        labels: {},
                        regions: {},
                    }),
            });

            // Click to show the frame
            fireEvent.click(element);

            const fallbackBadge = await testBed.findBySelector(element, '.pd-design__frame__fallback-badge');
            expect(fallbackBadge.textContent).toBe('Fallback');
        });
    });

    describe('Frame CSS Classes', () => {
        it('should apply correct classes when frame is visible', async () => {
            const { element } = await testBed.render(TestComponent, {
                props: {
                    designMetadata: {
                        id: 'test-1',
                        // The bed never wraps an EmbeddedSubtreeProvider, so this
                        // component is page content and shows its selection frame
                        // (the frame is suppressed only inside an embedded subtree).
                        contentLinkUuid: 'test-1-uuid',
                        isFragment: false,
                        isVisible: true,
                        isLocalized: true,
                    },
                },
            });

            // Click to show the frame
            fireEvent.click(element);

            const frame = await testBed.findBySelector(element, '.pd-design__frame');
            expect(frame.classList.contains('pd-design__frame--visible')).toBe(true);
        });

        it('should update classes correctly when showFrame changes', async () => {
            const { element } = await testBed.render(TestComponent, {
                props: {
                    designMetadata: {
                        id: 'test-1',
                        // See above — a page-content uuid keeps the frame active.
                        contentLinkUuid: 'test-1-uuid',
                        isFragment: false,
                        isVisible: true,
                        isLocalized: true,
                    },
                },
            });

            const frame = await testBed.findBySelector(element, '.pd-design__frame');

            // Initially frame should not be visible
            expect(frame.classList.contains('pd-design__frame--visible')).toBe(false);

            // Click to show the frame
            fireEvent.click(element);
            expect(frame.classList.contains('pd-design__frame--visible')).toBe(true);
        });
    });
});
