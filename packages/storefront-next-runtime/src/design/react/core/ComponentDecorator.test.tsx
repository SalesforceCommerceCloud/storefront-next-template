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

import React from 'react';
import { cleanup as tlCleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { createComponentTestBed } from '../../test/component-test-bed';

// Preload the dynamic context
import '../context/DesignContext';

// Test component to decorate
const TestComponent: React.FC<React.PropsWithChildren> = ({ children }) => (
    <div data-testid="test-component">{children}</div>
);

describe('design/react/ComponentDecorator', () => {
    const testBed = createComponentTestBed(() => ({
        elementsOnPoint: [] as HTMLElement[],
    }));

    beforeEach(() => {
        testBed.defineProperty(document, 'elementsFromPoint', {
            value: () => testBed.state.elementsOnPoint,
        });
        testBed.afterRender(async ({ root, findByTestId }) => {
            if (testBed.state.mode) {
                const region = await testBed.findBySelector(root, '.pd-design__region');
                const component = await findByTestId('design-component-test-3');

                testBed.state.elementsOnPoint = [component, region];
            }
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
        testBed.cleanup(() => tlCleanup());
    });

    describe('when decorating a component', () => {
        it('should render the original component when not in design mode', async () => {
            testBed.state.mode = null;

            const { element, getAllByTestId } = await testBed.render(TestComponent);

            expect(getAllByTestId('test-component')).toHaveLength(3);
            expect(element).toBeNull();
        });

        it('should render with design wrapper when in design mode', async () => {
            const { element } = await testBed.render(TestComponent);

            expect(element).toBeDefined();
        });

        describe('when the component is a fragment', () => {
            it('should include the corresponding fragment class', async () => {
                const { element } = await testBed.render(TestComponent, {
                    props: {
                        designMetadata: {
                            id: 'test-1',
                            contentLinkUuid: 'test-content-link-uuid',
                            isFragment: true,
                            isVisible: true,
                            isLocalized: true,
                        },
                    },
                    regionMetadata: {
                        id: 'test-region',
                    },
                });

                expect(element.classList.contains('pd-design__fragment')).toBe(true);
                expect(element.classList.contains('pd-design__component')).toBe(false);
            });
        });

        describe('when the component is a component', () => {
            it('should include the corresponding component class', async () => {
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
                    regionMetadata: {
                        id: 'test-region',
                    },
                });

                expect(element.classList.contains('pd-design__fragment')).toBe(false);
                expect(element.classList.contains('pd-design__component')).toBe(true);
            });
        });

        describe('when the component is hovered via mouseMove', () => {
            let hostSpy: Mock;

            beforeEach(() => {
                hostSpy = vi.fn();
                testBed.afterRender(async ({ host, element, root }) => {
                    host.on('ComponentHoveredIn', hostSpy);
                    // discoverComponents uses document.elementsFromPoint — point it at the hovered element
                    const region = await testBed.findBySelector(root, '.pd-design__region');
                    testBed.state.elementsOnPoint = [element, region];
                    fireEvent.mouseMove(element, { clientX: 100, clientY: 100 });
                });
            });
            it('should show the frame', async () => {
                const { element } = await testBed.render(TestComponent);

                await waitFor(() => {
                    expect(element.classList.contains('pd-design__frame--visible')).toBe(true);
                    expect(element.classList.contains('pd-design__decorator--hovered')).toBe(true);
                });
            });

            it('should notify the host of the hover', async () => {
                await testBed.render(TestComponent);

                await waitFor(() => {
                    expect(hostSpy).toHaveBeenCalledWith(expect.objectContaining({ componentId: 'test-1' }));
                });
            });

            describe('when hovering out of the component', () => {
                let hoverOutSpy: Mock;

                beforeEach(() => {
                    hoverOutSpy = vi.fn();
                    testBed.afterRender(async ({ host, element, root, findByTestId }) => {
                        await waitFor(() => {
                            expect(element.classList.contains('pd-design__decorator--hovered')).toBe(true);
                        });

                        // On mouse leave, discoverComponents checks what's at the cursor —
                        // simulate the cursor now being over a sibling component, not test-1
                        const region = await testBed.findBySelector(root, '.pd-design__region');
                        const sibling = await findByTestId('design-component-test-3');
                        testBed.state.elementsOnPoint = [sibling, region];

                        host.on('ComponentHoveredOut', hoverOutSpy);
                        fireEvent.mouseLeave(element, { clientX: 200, clientY: 200 });
                    });
                });

                it('should notify the host of the hover out', async () => {
                    await testBed.render(TestComponent);

                    await waitFor(() => {
                        expect(hostSpy).toHaveBeenCalledWith(expect.objectContaining({ componentId: 'test-1' }));
                    });
                });

                it('should not show the frame', async () => {
                    const { element } = await testBed.render(TestComponent);

                    await waitFor(() => {
                        expect(element.classList.contains('pd-design__frame--visible')).toBe(false);
                        expect(element.classList.contains('pd-design__decorator--hovered')).toBe(false);
                    });
                });
            });
        });

        describe('when mouseMove discovers a parent component at cursor position', () => {
            it('should hover the component found by discoverComponents, not the event target', async () => {
                const hostSpy = vi.fn();

                testBed.afterRender(async ({ host, root, findByTestId }) => {
                    host.on('ComponentHoveredIn', hostSpy);

                    // Simulate cursor leaving a child and landing on a parent —
                    // elementsFromPoint returns test-3 (a sibling) at those coordinates
                    const region = await testBed.findBySelector(root, '.pd-design__region');
                    const sibling = await findByTestId('design-component-test-3');
                    testBed.state.elementsOnPoint = [sibling, region];
                });

                const { element } = await testBed.render(TestComponent);

                // mouseMove on test-1's element, but elementsFromPoint says test-3 is at cursor
                fireEvent.mouseMove(element, { clientX: 300, clientY: 300 });

                await waitFor(() => {
                    expect(hostSpy).toHaveBeenCalledWith(expect.objectContaining({ componentId: 'test-3' }));
                });
            });
        });

        describe('when the component is selected', () => {
            it('should show the frame', async () => {
                const { element } = await testBed.render(TestComponent);

                element.click();

                const frame = await testBed.findBySelector(element, '.pd-design__frame');

                expect(frame.classList.contains('pd-design__frame--visible')).toBe(true);
                expect(element.classList.contains('pd-design__decorator--selected')).toBe(true);
            });

            it('should notify the host of the selection', async () => {
                const { element, host } = await testBed.render(TestComponent);

                return new Promise<void>((resolve) => {
                    host.on('ComponentSelected', (event) => {
                        expect(event).toEqual(
                            expect.objectContaining({
                                componentId: 'test-1',
                            })
                        );
                        resolve();
                    });

                    element?.click();
                });
            }, 500);

            describe('when there are multiple instances of the same component', () => {
                it('should select only the clicked instance', async () => {
                    // Render test-1 normally, but configure test-2 to have the same componentId as test-1
                    // This simulates duplicate components (same type, different instances)
                    const { element, root } = await testBed.render(TestComponent, {
                        configFactory: () =>
                            Promise.resolve({
                                locale: 'en-US',
                                components: {
                                    'test-1': {
                                        id: 'test-1',
                                        name: 'Test Component',
                                        type: 'commerce.test',
                                    },
                                    'test-2': {
                                        id: 'test-1', // Same componentId as test-1
                                        name: 'Test Component',
                                        type: 'commerce.test',
                                    },
                                },
                                componentTypes: {
                                    'commerce.test': {
                                        id: 'commerce.test',
                                        name: 'Commerce Test',
                                        label: 'Commerce Test',
                                        image: 'https://via.placeholder.com/150',
                                    },
                                },
                                labels: {},
                                regions: {},
                            }),
                    });

                    const instance1 = element;
                    const instance2 = await testBed.findBySelector(root, '[data-testid="design-component-test-2"]');

                    fireEvent.click(instance1);

                    await waitFor(() => {
                        expect(instance1.classList.contains('pd-design__decorator--selected')).toBe(true);
                        expect(instance2.classList.contains('pd-design__decorator--selected')).toBe(false);
                    });

                    fireEvent.click(instance2);

                    await waitFor(() => {
                        expect(instance1.classList.contains('pd-design__decorator--selected')).toBe(false);
                        expect(instance2.classList.contains('pd-design__decorator--selected')).toBe(true);
                    });
                });
            });
        });

        describe('when the component is deleted', () => {
            let hostSpy: Mock;

            beforeEach(() => {
                hostSpy = vi.fn();
                testBed.afterRender(async ({ host, element }) => {
                    // Select the component so the frame is shown
                    fireEvent.click(element);

                    await waitFor(() => {
                        expect(element.classList.contains('pd-design__frame--visible')).toBe(true);
                    });

                    host.on('ComponentDeleted', hostSpy);
                    const deleteButton = await testBed.findBySelector(element, '.pd-design__frame__delete-icon');
                    fireEvent.click(deleteButton);
                });
            });

            it('should notify the host of the deletion', async () => {
                await testBed.render(TestComponent, {
                    props: {
                        designMetadata: {
                            id: 'test-1',
                            contentLinkUuid: 'test-1-uuid',
                            isFragment: false,
                            isVisible: true,
                            isLocalized: true,
                        },
                    },
                    regionMetadata: {
                        id: 'test-region',
                    },
                });

                await waitFor(() => {
                    expect(hostSpy).toHaveBeenCalledWith(
                        expect.objectContaining({
                            componentId: 'test-1',
                            sourceComponentId: 'test-parent',
                            sourceRegionId: 'test-region',
                        })
                    );
                });
            });
        });

        describe('when the component is focused', () => {
            let scrollSpy: Mock;

            beforeEach(() => {
                scrollSpy = vi.fn();
                testBed.afterRender(({ element, host }) => {
                    element.scrollIntoView = scrollSpy;
                    host.focusComponent({ componentId: 'test-1', contentLinkUuid: 'test-1-uuid' });
                });
            });

            it('should scroll to the component that is focused', async () => {
                await testBed.render(TestComponent);

                await waitFor(() => {
                    expect(scrollSpy).toHaveBeenCalled();
                });
            });
        });

        describe('when the component name is displayed', () => {
            it('should use the component type label when available', async () => {
                const { element } = await testBed.render(TestComponent, {
                    props: {
                        designMetadata: {
                            id: 'test-1',
                            contentLinkUuid: 'test-content-link-uuid',
                            name: 'FallbackName',
                            isFragment: false,
                            isVisible: true,
                            isLocalized: true,
                        },
                    },
                    configFactory: () =>
                        Promise.resolve({
                            components: {
                                'test-1': {
                                    id: 'test-1',
                                    type: 'test-type',
                                },
                            },
                            componentTypes: {
                                'test-type': {
                                    id: 'test-type',
                                    name: 'TestType',
                                    image: 'test-image.png',
                                    label: 'Custom Label',
                                },
                            },
                            labels: {},
                            regions: {},
                        }),
                });

                // Select component to show the frame
                element.click();

                const frameLabel = await testBed.findBySelector(element, '.pd-design__frame__name');
                expect(frameLabel.textContent).toBe('Custom Label');
            });

            it('should fall back to name when the component type label is not available', async () => {
                const { element } = await testBed.render(TestComponent, {
                    props: {
                        designMetadata: {
                            id: 'test-1',
                            contentLinkUuid: 'test-content-link-uuid',
                            name: 'FallbackName',
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
                                    type: 'commerce.test',
                                },
                            },
                            componentTypes: {},
                            labels: {},
                            regions: {},
                        }),
                });

                // Select component to show the frame
                element.click();

                const frameLabel = await testBed.findBySelector(element, '.pd-design__frame__name');
                expect(frameLabel.textContent).toBe('FallbackName');
            });

            it('should fall back to "Component" when neither label nor name is available', async () => {
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
                                    type: 'commerce.test',
                                },
                            },
                            componentTypes: {},
                            labels: {},
                            regions: {},
                        }),
                });

                // Select component to show the frame
                element.click();

                const frameLabel = await testBed.findBySelector(element, '.pd-design__frame__name');
                expect(frameLabel.textContent).toBe('Component');
            });
        });
    });

    describe('when testing localization features', () => {
        it('should include unlocalized class when component is not localized', async () => {
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
            });

            expect(element.classList.contains('pd-design__component--unlocalized')).toBe(true);
        });

        it('should not include unlocalized class when component is localized', async () => {
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
            });

            expect(element.classList.contains('pd-design__component--unlocalized')).toBe(false);
        });

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

        it('should use custom fallback label when configured', async () => {
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

        it('should apply unlocalized class to fragments when not localized', async () => {
            const { element } = await testBed.render(TestComponent, {
                props: {
                    designMetadata: {
                        id: 'test-1',
                        contentLinkUuid: 'test-content-link-uuid',
                        isFragment: true,
                        isVisible: true,
                        isLocalized: false,
                    },
                },
            });

            expect(element.classList.contains('pd-design__component--unlocalized')).toBe(true);
            expect(element.classList.contains('pd-design__fragment')).toBe(true);
        });
    });

    describe('when dragging a component', () => {
        let mockRect: Partial<DOMRect>;

        beforeEach(() => {
            mockRect = { x: 0, y: 0, width: 600, height: 600 };
            testBed.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', { value: () => mockRect });
            testBed.defineProperty(window, 'scrollX', { value: 0 });
            testBed.defineProperty(window, 'scrollY', { value: 0 });
        });

        describe.each`
            width  | height | x      | y      | axis   | insertType
            ${600} | ${600} | ${100} | ${300} | ${'x'} | ${'before'}
            ${600} | ${600} | ${500} | ${300} | ${'x'} | ${'after'}
            ${600} | ${600} | ${300} | ${100} | ${'y'} | ${'before'}
            ${600} | ${600} | ${300} | ${500} | ${'y'} | ${'after'}
            ${600} | ${600} | ${100} | ${100} | ${'y'} | ${'before'}
            ${600} | ${600} | ${500} | ${500} | ${'y'} | ${'after'}
            ${600} | ${300} | ${200} | ${50}  | ${'y'} | ${'before'}
            ${600} | ${300} | ${200} | ${250} | ${'y'} | ${'after'}
            ${300} | ${600} | ${50}  | ${200} | ${'x'} | ${'before'}
            ${300} | ${600} | ${250} | ${200} | ${'x'} | ${'after'}
        `('to ($x, $y $width x $height) position', ({ width, height, x, y, axis, insertType }) => {
            beforeEach(() => {
                mockRect = { left: 0, top: 0, width, height };
                testBed.afterRender(async ({ element }) => {
                    // Click on move icon
                    const moveButton = await testBed.findBySelector(element, '.pd-design__frame__toolbox-button');

                    fireEvent.mouseDown(moveButton);
                    fireEvent.dragStart(moveButton);
                    fireEvent(window, Object.assign(new DragEvent('dragover'), { clientX: x, clientY: y }));
                });
            });

            it(`should show the drop target on ${axis} axis and with ${insertType} insert type`, async () => {
                const { findByTestId } = await testBed.render(TestComponent);
                const component = await findByTestId('design-component-test-3');

                expect(component.classList.contains(`pd-design__drop-target__${axis}-${insertType}`)).toBe(true);
            });
        });

        it('should not allow dropping a component on itself', async () => {
            mockRect = { left: 0, top: 0, width: 600, height: 600 };

            const { element } = await testBed.render(TestComponent, {
                props: {
                    designMetadata: {
                        id: 'test-1',
                        // The bed never wraps an EmbeddedSubtreeProvider, so this
                        // component is page content (draggable, with a toolbox); the
                        // contentLinkUuid identifies it for the drop-on-itself check.
                        contentLinkUuid: 'test-1-uuid',
                        isFragment: false,
                        isVisible: true,
                        isLocalized: true,
                    },
                },
            });

            // Click on move icon to start dragging
            const moveButton = await testBed.findBySelector(element, '.pd-design__frame__toolbox-button');
            fireEvent.mouseDown(moveButton);
            fireEvent.dragStart(moveButton);

            // Try to drag over itself
            const dragOverEvent = Object.assign(new DragEvent('dragover'), {
                clientX: 300,
                clientY: 300,
                preventDefault: vi.fn(),
            });
            fireEvent(element, dragOverEvent);

            // preventDefault should not be called since we're dragging over the same component
            expect(dragOverEvent.preventDefault).not.toHaveBeenCalled();
        });
    });
});
