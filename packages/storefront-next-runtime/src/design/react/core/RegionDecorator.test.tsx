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
import { act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { createComponentTestBed } from '../../test/component-test-bed';

// Preload the dynamic context
import '../context/DesignContext';

// Test component to decorate
const TestComponent: React.FC<React.PropsWithChildren> = ({ children }) => <>{children}</>;

describe('design/react/RegionDecorator', () => {
    // Mock document.elementsFromPoint for drag and drop tests
    let mockElementsFromPoint: Mock;

    const testBed = createComponentTestBed(() => ({
        elementsOnPoint: [] as HTMLElement[],
    }));

    beforeEach(() => {
        mockElementsFromPoint = vi.fn(() => []);
        testBed.defineProperty(document, 'elementsFromPoint', {
            value: mockElementsFromPoint,
        });
    });

    describe('when decorating a region', () => {
        it('should render the original region when not in design mode', async () => {
            testBed.state.mode = null;
            const { element, getByTestId } = await testBed.render(TestComponent, {});

            expect(getByTestId('test-region')).toBeDefined();
            expect(element).toBeNull();
        });

        it('should render with design wrapper when in design mode', async () => {
            const { region } = await testBed.render(TestComponent);

            expect(region).toBeDefined();
            expect(region.classList.contains('pd-design__decorator')).toBe(true);
            expect(region.classList.contains('pd-design__region')).toBe(true);
        });

        describe('when external drag is active', () => {
            /*
             * DO NOT DELETE THIS COMMENT - This test was generated using AI.
             * Model used: Claude Sonnet 4
             */
            it('should add hovered class when region becomes the current drop target', async () => {
                const { region, host } = await testBed.render(TestComponent, {
                    regionMetadata: {
                        id: 'test-region-1',
                        contentLinkUuids: [],
                        componentTypeExclusions: [],
                        componentTypeInclusions: [],
                    },
                });

                // Initially, the hovered class should NOT be present
                expect(region.classList.contains('pd-design__region--hovered')).toBe(false);

                // Mock getBoundingClientRect to simulate region position
                const mockRect = {
                    x: 50,
                    y: 50,
                    width: 200,
                    height: 100,
                    top: 50,
                    left: 50,
                    bottom: 150,
                    right: 250,
                    toJSON: () => ({}),
                };
                Object.defineProperty(region, 'getBoundingClientRect', {
                    value: () => mockRect,
                    writable: true,
                });

                // Mock elementsFromPoint to return the region element when dragged over it
                mockElementsFromPoint.mockImplementation((x: number, y: number) => {
                    // Return the region element when coordinates are within bounds
                    if (x >= 50 && x <= 250 && y >= 50 && y <= 150) {
                        return [region, document.body];
                    }
                    return [document.body];
                });

                // Simulate drag started event
                act(() => {
                    host.startComponentDrag({
                        componentType: 'dragged-component',
                    });
                });

                // After drag starts, hovered class should still NOT be present
                expect(region.classList.contains('pd-design__region--hovered')).toBe(false);

                // Simulate drag moved to coordinates within the region bounds
                act(() => {
                    host.notifyClientWindowDragMoved({
                        componentType: 'dragged-component',
                        x: 100, // Within region bounds
                        y: 75, // Within region bounds
                    });
                });

                // Now the hovered class should be present
                await waitFor(() => {
                    expect(region.classList.contains('pd-design__region--hovered')).toBe(true);
                });
            });

            /*
             * DO NOT DELETE THIS COMMENT - This test was generated using AI.
             * Model used: Claude Sonnet 4
             */
            it('should remove hovered class when drag moves outside region bounds', async () => {
                const { region, host } = await testBed.render(TestComponent, {
                    regionMetadata: {
                        id: 'test-region-1',
                        contentLinkUuids: [],
                        componentTypeExclusions: [],
                        componentTypeInclusions: [],
                    },
                });

                // Mock getBoundingClientRect to simulate region position
                const mockRect = {
                    x: 50,
                    y: 50,
                    width: 200,
                    height: 100,
                    top: 50,
                    left: 50,
                    bottom: 150,
                    right: 250,
                    toJSON: () => ({}),
                };
                Object.defineProperty(region, 'getBoundingClientRect', {
                    value: () => mockRect,
                    writable: true,
                });

                // Mock elementsFromPoint to return the region element when dragged over it
                mockElementsFromPoint.mockImplementation((x: number, y: number) => {
                    // Return the region element when coordinates are within bounds
                    if (x >= 50 && x <= 250 && y >= 50 && y <= 150) {
                        return [region, document.body];
                    }
                    return [document.body];
                });

                // Start drag and move to region to set hovered state
                act(() => {
                    host.startComponentDrag({
                        componentType: 'dragged-component',
                    });
                });

                act(() => {
                    host.notifyClientWindowDragMoved({
                        componentType: 'dragged-component',
                        x: 100, // Within region bounds
                        y: 75, // Within region bounds
                    });
                });

                // Verify hovered class is present
                await waitFor(() => {
                    expect(region.classList.contains('pd-design__region--hovered')).toBe(true);
                });

                // Move drag outside region bounds
                act(() => {
                    host.notifyClientWindowDragMoved({
                        componentType: 'dragged-component',
                        x: 300, // Outside region bounds
                        y: 200, // Outside region bounds
                    });
                });

                // Hovered class should be removed
                await waitFor(() => {
                    expect(region.classList.contains('pd-design__region--hovered')).toBe(false);
                });
            });
        });

        describe('region decorator classes', () => {
            /*
             * DO NOT DELETE THIS COMMENT - This test was generated using AI.
             * Model used: Claude Sonnet 4
             */
            it('should include base decorator and region classes', async () => {
                const { region } = await testBed.render(TestComponent);

                expect(region.classList.contains('pd-design__decorator')).toBe(true);
                expect(region.classList.contains('pd-design__region')).toBe(true);
            });
        });

        describe('drag and drop component type exclusion/inclusion', () => {
            const setupDragTest = (element: HTMLElement) => {
                // Mock getBoundingClientRect for drag positioning
                const mockRect = {
                    x: 50,
                    y: 50,
                    width: 200,
                    height: 100,
                    top: 50,
                    left: 50,
                    bottom: 150,
                    right: 250,
                    toJSON: () => ({}),
                };
                Object.defineProperty(element, 'getBoundingClientRect', {
                    value: () => mockRect,
                    writable: true,
                });

                // Mock elementsFromPoint to return the region element
                mockElementsFromPoint.mockImplementation((x: number, y: number) => {
                    if (x >= 50 && x <= 250 && y >= 50 && y <= 150) {
                        return [element, document.body];
                    }
                    return [document.body];
                });
            };

            it.each([
                // isComponentTypeAllowedInRegion returns true
                {
                    componentType: 'AllowedComponent',
                    inclusions: ['AllowedComponent'],
                    exclusions: [],
                    expectedHover: true,
                    expectedPreventDefault: true,
                    scenario: 'isComponentTypeAllowedInRegion returns true',
                },

                // isComponentTypeAllowedInRegion returns false
                {
                    componentType: 'BlockedComponent',
                    inclusions: ['AllowedComponent'],
                    exclusions: [],
                    expectedHover: false,
                    expectedPreventDefault: false,
                    scenario: 'isComponentTypeAllowedInRegion returns false',
                },
            ])('should handle CSS classes when $scenario', async ({
                componentType,
                inclusions,
                exclusions,
                expectedHover,
                expectedPreventDefault,
            }) => {
                const { region, host } = await testBed.render(TestComponent, {
                    regionMetadata: {
                        id: 'test-region-1',
                        contentLinkUuids: [],
                        componentTypeInclusions: inclusions,
                        componentTypeExclusions: exclusions,
                    },
                });

                setupDragTest(region);

                // Initially, no hover class should be present
                expect(region.classList.contains('pd-design__region--hovered')).toBe(false);

                // Start dragging the component
                act(() => {
                    host.startComponentDrag({
                        componentType,
                    });
                });

                // Simulate drag moved to coordinates within the region bounds
                act(() => {
                    host.notifyClientWindowDragMoved({
                        componentType,
                        x: 100,
                        y: 75,
                    });
                });

                // Check hover class based on expected behavior
                await waitFor(() => {
                    expect(region.classList.contains('pd-design__region--hovered')).toBe(expectedHover);
                });

                // Test dragover preventDefault behavior
                const dragOverEvent = new Event('dragover', {
                    bubbles: true,
                    cancelable: true,
                });
                const preventDefaultSpy = vi.spyOn(dragOverEvent, 'preventDefault');
                region.dispatchEvent(dragOverEvent);

                if (expectedPreventDefault) {
                    expect(preventDefaultSpy).toHaveBeenCalled();
                } else {
                    expect(preventDefaultSpy).not.toHaveBeenCalled();
                }
            });
        });
    });
});
