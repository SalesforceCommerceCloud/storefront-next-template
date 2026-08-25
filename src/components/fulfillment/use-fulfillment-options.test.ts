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

import { createElement } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useFulfillmentOptions } from './use-fulfillment-options';
import { createFulfillmentSelection } from './types';

const available = { available: true };

describe('useFulfillmentOptions', () => {
    it('selects and synchronizes the sole available contributor', async () => {
        const synchronizeSelection = vi.fn();
        const { result } = renderHook(() =>
            useFulfillmentOptions({
                contributors: [
                    {
                        option: {
                            id: 'delivery',
                            label: 'Delivery',
                            availability: available,
                        },
                    },
                ],
                synchronizeSelection,
            })
        );

        await waitFor(() => expect(result.current.value).toBe('delivery'));
        expect(synchronizeSelection).toHaveBeenCalledWith('delivery');
    });

    it('selects the first available contributor when the default is unavailable during server rendering', () => {
        function Probe() {
            const { value } = useFulfillmentOptions({
                contributors: [
                    {
                        option: {
                            id: 'delivery',
                            label: 'Delivery',
                            availability: { available: false },
                        },
                        defaultSelected: true,
                    },
                    {
                        option: {
                            id: 'pickup',
                            label: 'Pickup',
                            availability: available,
                        },
                    },
                ],
            });

            return createElement('span', null, value);
        }

        expect(renderToString(createElement(Probe))).toContain('pickup');
    });

    it('orders static contributors and synchronizes selection', () => {
        const synchronizeSelection = vi.fn();
        const onSelect = vi.fn();
        const { result } = renderHook(() =>
            useFulfillmentOptions({
                contributors: [
                    {
                        option: {
                            id: 'pickup',
                            order: 20,
                            label: 'Pickup',
                            availability: available,
                        },
                        onSelect,
                    },
                    {
                        option: {
                            id: 'delivery',
                            order: 10,
                            label: 'Delivery',
                            availability: available,
                        },
                    },
                ],
                synchronizeSelection,
            })
        );

        expect(result.current.options.map(({ id }) => id)).toEqual(['delivery', 'pickup']);
        void act(() => result.current.select('pickup'));
        expect(result.current.value).toBe('pickup');
        expect(onSelect).toHaveBeenCalledOnce();
        expect(synchronizeSelection).toHaveBeenCalledWith('pickup');
    });

    it('does not select a contributor that handles the interaction', () => {
        const onSelect = vi.fn(() => false);
        const { result } = renderHook(() =>
            useFulfillmentOptions({
                contributors: [
                    {
                        option: {
                            id: 'delivery',
                            label: 'Delivery',
                            availability: available,
                        },
                    },
                    {
                        option: {
                            id: 'pickup',
                            label: 'Pickup',
                            availability: available,
                        },
                        onSelect,
                    },
                ],
            })
        );

        act(() => expect(result.current.select('pickup')).toBe(false));

        expect(result.current.value).toBeUndefined();
        expect(onSelect).toHaveBeenCalledOnce();
    });

    it('moves an unavailable selection to the first available contributor', async () => {
        const synchronizeSelection = vi.fn();
        const { result } = renderHook(() =>
            useFulfillmentOptions({
                contributors: [
                    {
                        option: {
                            id: 'delivery',
                            order: 10,
                            label: 'Delivery',
                            availability: available,
                        },
                    },
                    {
                        option: {
                            id: 'pickup',
                            order: 20,
                            label: 'Pickup',
                            availability: { available: false },
                        },
                    },
                ],
                initialValue: 'pickup',
                synchronizeSelection,
            })
        );

        await waitFor(() => expect(result.current.value).toBe('delivery'));
        expect(synchronizeSelection).toHaveBeenCalledWith('delivery');
    });

    it('selects the contributor that explicitly provides the default', async () => {
        const synchronizeSelection = vi.fn();
        const { result } = renderHook(() =>
            useFulfillmentOptions({
                contributors: [
                    {
                        option: {
                            id: 'pickup',
                            order: 20,
                            label: 'Pickup',
                            availability: available,
                        },
                    },
                    {
                        option: {
                            id: 'delivery',
                            order: 10,
                            label: 'Delivery',
                            availability: available,
                        },
                        defaultSelected: true,
                    },
                ],
                synchronizeSelection,
            })
        );

        await waitFor(() => expect(result.current.value).toBe('delivery'));
        expect(synchronizeSelection).toHaveBeenCalledWith('delivery');
    });

    it('falls back to an available contributor when the default is unavailable', async () => {
        const synchronizeSelection = vi.fn();
        const { result } = renderHook(() =>
            useFulfillmentOptions({
                contributors: [
                    {
                        option: {
                            id: 'delivery',
                            order: 10,
                            label: 'Delivery',
                            availability: { available: false },
                        },
                        defaultSelected: true,
                    },
                    {
                        option: {
                            id: 'pickup',
                            order: 20,
                            label: 'Pickup',
                            availability: available,
                        },
                    },
                ],
                synchronizeSelection,
            })
        );

        await waitFor(() => expect(result.current.value).toBe('pickup'));
        expect(synchronizeSelection).toHaveBeenCalledWith('pickup');
    });

    it('selects the canonical delivery contributor when it is the default', async () => {
        const synchronizeSelection = vi.fn();
        const { result } = renderHook(() =>
            useFulfillmentOptions({
                contributors: [
                    {
                        option: {
                            id: 'delivery',
                            order: 10,
                            label: 'Delivery',
                            availability: available,
                        },
                        defaultSelected: true,
                    },
                    {
                        option: {
                            id: 'pickup',
                            order: 20,
                            label: 'Pickup',
                            availability: available,
                        },
                    },
                ],
                synchronizeSelection,
            })
        );

        await waitFor(() => expect(result.current.value).toBe('delivery'));
        expect(synchronizeSelection).toHaveBeenCalledWith('delivery');
    });

    it('allows contributors to provide pickup metadata for the selected option', () => {
        const contributor = {
            option: { id: 'pickup', label: 'Pickup', availability: available },
            createSelection: (optionId: 'pickup') =>
                createFulfillmentSelection(optionId, {
                    storeId: 'store-1',
                    inventoryId: 'inventory-1',
                }),
        };

        expect(contributor.createSelection('pickup')).toEqual({
            optionId: 'pickup',
            metadata: { storeId: 'store-1', inventoryId: 'inventory-1' },
        });
    });
});
