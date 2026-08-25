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

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState, type PropsWithChildren } from 'react';
import type { ShopperBasketsV2 } from '@/scapi';
import PickupProvider, { usePickup } from './pickup-context';
import { createMockBasketWithPickupItems } from '../tests/__mocks__/basket';

describe('PickupProvider', () => {
    const wrapper = ({ children }: PropsWithChildren) => <PickupProvider>{children}</PickupProvider>;

    describe('usePickup hook', () => {
        it('returns null when used outside provider', () => {
            const { result } = renderHook(() => usePickup());

            expect(result.current).toBeNull();
        });

        it('initializes with empty map', () => {
            const { result } = renderHook(() => usePickup(), { wrapper });

            expect(result.current).toBeDefined();
            if (result.current) {
                expect(result.current.pickupBasketItems).toBeInstanceOf(Map);
                expect(result.current.pickupBasketItems.size).toBe(0);
                expect(result.current.pickupStores).toBeInstanceOf(Map);
                expect(result.current.pickupStores.size).toBe(0);
            }
        });

        it('provides all required methods', () => {
            const { result } = renderHook(() => usePickup(), { wrapper });

            expect(result.current).toBeDefined();
            if (result.current) {
                expect(typeof result.current.addItem).toBe('function');
                expect(typeof result.current.removeItem).toBe('function');
                expect(typeof result.current.clearItems).toBe('function');
            }
        });
    });

    describe('addItem', () => {
        it('adds a product to the map', () => {
            const { result } = renderHook(() => usePickup(), { wrapper });

            act(() => {
                if (result.current) {
                    result.current.addItem('product-1', 'inventory-A', 'store-1');
                }
            });

            if (result.current) {
                const pickupInfo = result.current.pickupBasketItems.get('product-1');
                expect(pickupInfo).toEqual({ inventoryId: 'inventory-A', storeId: 'store-1' });
                expect(result.current.pickupBasketItems.size).toBe(1);
            }
        });

        it('updates inventoryId and storeId if product already exists', () => {
            const { result } = renderHook(() => usePickup(), { wrapper });

            act(() => {
                if (result.current) {
                    result.current.addItem('product-1', 'inventory-A', 'store-1');
                }
            });

            act(() => {
                if (result.current) {
                    result.current.addItem('product-1', 'inventory-B', 'store-2');
                }
            });

            if (result.current) {
                const pickupInfo = result.current.pickupBasketItems.get('product-1');
                expect(pickupInfo).toEqual({ inventoryId: 'inventory-B', storeId: 'store-2' });
                expect(result.current.pickupBasketItems.size).toBe(1);
            }
        });

        it('preserves the map when the product already has the same pickup details', () => {
            const { result } = renderHook(() => usePickup(), { wrapper });

            act(() => {
                result.current?.addItem('product-1', 'inventory-A', 'store-1');
            });
            const mapAfterAdd = result.current?.pickupBasketItems;

            act(() => {
                result.current?.addItem('product-1', 'inventory-A', 'store-1');
            });

            expect(result.current?.pickupBasketItems).toBe(mapAfterAdd);
        });

        it('adds multiple products correctly', () => {
            const { result } = renderHook(() => usePickup(), { wrapper });

            act(() => {
                if (result.current) {
                    result.current.addItem('product-1', 'inventory-A', 'store-1');
                    result.current.addItem('product-2', 'inventory-B', 'store-2');
                }
            });

            if (result.current) {
                expect(result.current.pickupBasketItems.size).toBe(2);
                expect(result.current.pickupBasketItems.get('product-1')).toEqual({
                    inventoryId: 'inventory-A',
                    storeId: 'store-1',
                });
                expect(result.current.pickupBasketItems.get('product-2')).toEqual({
                    inventoryId: 'inventory-B',
                    storeId: 'store-2',
                });
            }
        });
    });

    describe('removeItem', () => {
        it('removes a product from the map', () => {
            const { result } = renderHook(() => usePickup(), { wrapper });

            act(() => {
                if (result.current) {
                    result.current.addItem('product-1', 'inventory-A', 'store-1');
                }
            });

            act(() => {
                if (result.current) {
                    result.current.removeItem('product-1');
                }
            });

            if (result.current) {
                expect(result.current.pickupBasketItems.has('product-1')).toBe(false);
                expect(result.current.pickupBasketItems.size).toBe(0);
            }
        });

        it('does nothing if product does not exist', () => {
            const { result } = renderHook(() => usePickup(), { wrapper });

            act(() => {
                if (result.current) {
                    result.current.addItem('product-1', 'inventory-A', 'store-1');
                }
            });

            act(() => {
                if (result.current) {
                    result.current.removeItem('product-2');
                }
            });

            if (result.current) {
                expect(result.current.pickupBasketItems.has('product-1')).toBe(true);
                expect(result.current.pickupBasketItems.size).toBe(1);
            }
        });

        it('preserves the map when the product does not exist', () => {
            const { result } = renderHook(() => usePickup(), { wrapper });
            const initialMap = result.current?.pickupBasketItems;

            act(() => {
                result.current?.removeItem('product-1');
            });

            expect(result.current?.pickupBasketItems).toBe(initialMap);
        });

        it('removes only the specified product', () => {
            const { result } = renderHook(() => usePickup(), { wrapper });

            act(() => {
                if (result.current) {
                    result.current.addItem('product-1', 'inventory-A', 'store-1');
                    result.current.addItem('product-2', 'inventory-B', 'store-2');
                }
            });

            act(() => {
                if (result.current) {
                    result.current.removeItem('product-1');
                }
            });

            if (result.current) {
                expect(result.current.pickupBasketItems.has('product-1')).toBe(false);
                expect(result.current.pickupBasketItems.has('product-2')).toBe(true);
                expect(result.current.pickupBasketItems.size).toBe(1);
            }
        });
    });

    describe('clearItems', () => {
        it('clears all pickup items', () => {
            const { result } = renderHook(() => usePickup(), { wrapper });

            act(() => {
                if (result.current) {
                    result.current.addItem('product-1', 'inventory-A', 'store-1');
                    result.current.addItem('product-2', 'inventory-B', 'store-2');
                }
            });

            if (result.current) {
                expect(result.current.pickupBasketItems.size).toBe(2);
            }

            act(() => {
                if (result.current) {
                    result.current.clearItems();
                }
            });

            if (result.current) {
                expect(result.current.pickupBasketItems.size).toBe(0);
            }
        });

        it('is safe to call on an empty map', () => {
            const { result } = renderHook(() => usePickup(), { wrapper });
            const initialMap = result.current?.pickupBasketItems;

            if (result.current) {
                expect(result.current.pickupBasketItems.size).toBe(0);
            }

            act(() => {
                if (result.current) {
                    result.current.clearItems();
                }
            });

            if (result.current) {
                expect(result.current.pickupBasketItems.size).toBe(0);
            }
            expect(result.current?.pickupBasketItems).toBe(initialMap);
        });
    });

    describe('basket prop', () => {
        it('accepts basket with pickup items', () => {
            const basket = createMockBasketWithPickupItems([
                { productId: 'product-1', inventoryId: 'inventory-A', storeId: 'store-1' },
                { productId: 'product-2', inventoryId: 'inventory-B', storeId: 'store-2' },
            ]);

            const customWrapper = ({ children }: PropsWithChildren) => (
                <PickupProvider basket={basket}>{children}</PickupProvider>
            );

            const { result } = renderHook(() => usePickup(), { wrapper: customWrapper });

            if (result.current) {
                expect(result.current.pickupBasketItems.size).toBe(2);
                expect(result.current.pickupBasketItems.get('product-1')).toEqual({
                    inventoryId: 'inventory-A',
                    storeId: 'store-1',
                });
                expect(result.current.pickupBasketItems.get('product-2')).toEqual({
                    inventoryId: 'inventory-B',
                    storeId: 'store-2',
                });
            }
        });

        it('uses empty map when basket is undefined', () => {
            const { result } = renderHook(() => usePickup(), { wrapper });

            if (result.current) {
                expect(result.current.pickupBasketItems.size).toBe(0);
            }
        });

        it('uses empty map when basket has no pickup items', () => {
            const basket = createMockBasketWithPickupItems([]);

            const customWrapper = ({ children }: PropsWithChildren) => (
                <PickupProvider basket={basket}>{children}</PickupProvider>
            );

            const { result } = renderHook(() => usePickup(), { wrapper: customWrapper });

            if (result.current) {
                expect(result.current.pickupBasketItems.size).toBe(0);
            }
        });
    });

    describe('stores prop', () => {
        it('accepts initial stores', () => {
            const initialStores = new Map([
                ['store-1', { id: 'store-1', name: 'Store One', inventoryId: 'inventory-A' }],
                ['store-2', { id: 'store-2', name: 'Store Two', inventoryId: 'inventory-B' }],
            ]);

            const customWrapper = ({ children }: PropsWithChildren) => (
                <PickupProvider initialPickupStores={initialStores}>{children}</PickupProvider>
            );

            const { result } = renderHook(() => usePickup(), { wrapper: customWrapper });

            if (result.current) {
                expect(result.current.pickupStores.size).toBe(2);
                expect(result.current.pickupStores.get('store-1')).toEqual({
                    id: 'store-1',
                    name: 'Store One',
                    inventoryId: 'inventory-A',
                });
                expect(result.current.pickupStores.get('store-2')).toEqual({
                    id: 'store-2',
                    name: 'Store Two',
                    inventoryId: 'inventory-B',
                });
            }
        });

        it('uses empty map when stores is undefined', () => {
            const { result } = renderHook(() => usePickup(), { wrapper });

            if (result.current) {
                expect(result.current.pickupStores.size).toBe(0);
            }
        });

        it('accepts both basket and stores', () => {
            const basket = createMockBasketWithPickupItems([
                { productId: 'product-1', inventoryId: 'inventory-A', storeId: 'store-1' },
            ]);
            const initialStores = new Map([
                ['store-1', { id: 'store-1', name: 'Store One', inventoryId: 'inventory-A' }],
            ]);

            const customWrapper = ({ children }: PropsWithChildren) => (
                <PickupProvider basket={basket} initialPickupStores={initialStores}>
                    {children}
                </PickupProvider>
            );

            const { result } = renderHook(() => usePickup(), { wrapper: customWrapper });

            if (result.current) {
                expect(result.current.pickupBasketItems.size).toBe(1);
                expect(result.current.pickupStores.size).toBe(1);
                expect(result.current.pickupBasketItems.get('product-1')).toEqual({
                    inventoryId: 'inventory-A',
                    storeId: 'store-1',
                });
                expect(result.current.pickupStores.get('store-1')).toEqual({
                    id: 'store-1',
                    name: 'Store One',
                    inventoryId: 'inventory-A',
                });
            }
        });
    });

    describe('state immutability', () => {
        it('creates new map instance on add', () => {
            const { result } = renderHook(() => usePickup(), { wrapper });

            if (!result.current) return;
            const initialMap = result.current.pickupBasketItems;

            act(() => {
                result.current?.addItem('product-1', 'inventory-A', 'store-1');
            });

            expect(result.current.pickupBasketItems).not.toBe(initialMap);
        });

        it('creates new map instance on remove', () => {
            const { result } = renderHook(() => usePickup(), { wrapper });

            act(() => {
                if (result.current) {
                    result.current.addItem('product-1', 'inventory-A', 'store-1');
                }
            });

            if (!result.current) return;
            const mapAfterAdd = result.current.pickupBasketItems;

            act(() => {
                if (result.current) {
                    result.current.removeItem('product-1');
                }
            });

            expect(result.current.pickupBasketItems).not.toBe(mapAfterAdd);
        });

        it('creates new map instance on clear', () => {
            const { result } = renderHook(() => usePickup(), { wrapper });

            act(() => {
                if (result.current) {
                    result.current.addItem('product-1', 'inventory-A', 'store-1');
                }
            });

            if (!result.current) return;
            const mapAfterAdd = result.current.pickupBasketItems;

            act(() => {
                if (result.current) {
                    result.current.clearItems();
                }
            });

            expect(result.current.pickupBasketItems).not.toBe(mapAfterAdd);
        });
    });

    describe('complex scenarios', () => {
        it('maintains state consistency across multiple actions', () => {
            const { result } = renderHook(() => usePickup(), { wrapper });

            act(() => {
                if (result.current) {
                    result.current.addItem('product-1', 'inventory-A', 'store-1');
                }
            });

            act(() => {
                if (result.current) {
                    result.current.removeItem('product-1');
                }
            });

            act(() => {
                if (result.current) {
                    result.current.addItem('product-2', 'inventory-B', 'store-2');
                }
            });

            if (result.current) {
                expect(result.current.pickupBasketItems.size).toBe(1);
                expect(result.current.pickupBasketItems.get('product-2')).toEqual({
                    inventoryId: 'inventory-B',
                    storeId: 'store-2',
                });
            }
        });

        it('handles add, remove, and clear in sequence', () => {
            const { result } = renderHook(() => usePickup(), { wrapper });

            act(() => {
                if (result.current) {
                    result.current.addItem('p1', 'i1', 's1');
                    result.current.addItem('p2', 'i2', 's2');
                }
            });

            if (result.current) {
                expect(result.current.pickupBasketItems.size).toBe(2);
            }

            act(() => {
                if (result.current) {
                    result.current.removeItem('p1');
                }
            });

            if (result.current) {
                expect(result.current.pickupBasketItems.size).toBe(1);
            }

            act(() => {
                if (result.current) {
                    result.current.clearItems();
                }
            });

            if (result.current) {
                expect(result.current.pickupBasketItems.size).toBe(0);
            }
        });

        it('correctly handles clear and then add new items', () => {
            const { result } = renderHook(() => usePickup(), { wrapper });

            act(() => {
                if (result.current) {
                    result.current.addItem('prod1', 'inv1', 'store1');
                }
            });

            act(() => {
                if (result.current) {
                    result.current.clearItems();
                }
            });

            act(() => {
                if (result.current) {
                    result.current.addItem('prod2', 'inv2', 'store2');
                }
            });

            if (result.current) {
                expect(result.current.pickupBasketItems.size).toBe(1);
                expect(result.current.pickupBasketItems.get('prod2')).toEqual({
                    inventoryId: 'inv2',
                    storeId: 'store2',
                });
            }
        });
    });

    describe('sync items from basket prop', () => {
        // Helper to create a testable wrapper with state
        const createTestWrapper = (initialBasket?: ShopperBasketsV2.schemas['Basket']) => {
            const setBasketRef = {
                current: null as ((basket: ShopperBasketsV2.schemas['Basket'] | undefined) => void) | null,
            };

            const TestWrapper = ({ children }: PropsWithChildren) => {
                const [basket, setBasketState] = useState<ShopperBasketsV2.schemas['Basket'] | undefined>(
                    initialBasket
                );
                setBasketRef.current = setBasketState;
                return <PickupProvider basket={basket}>{children}</PickupProvider>;
            };

            return {
                TestWrapper,
                setBasket: (basket: ShopperBasketsV2.schemas['Basket'] | undefined) => {
                    if (setBasketRef.current) {
                        setBasketRef.current(basket);
                    }
                },
            };
        };

        it('clears state when basket is undefined', () => {
            const basket = createMockBasketWithPickupItems([
                { productId: 'product-1', inventoryId: 'inventory-A', storeId: 'store-1' },
            ]);
            const { TestWrapper, setBasket } = createTestWrapper(basket);

            const { result } = renderHook(() => usePickup(), {
                wrapper: TestWrapper,
            });

            if (result.current) {
                expect(result.current.pickupBasketItems.size).toBe(1);
            }

            // Change basket to undefined
            act(() => {
                setBasket(undefined);
            });

            if (result.current) {
                expect(result.current.pickupBasketItems.size).toBe(0);
            }
        });

        it('updates state when basket changes from undefined to a basket with items', () => {
            const { TestWrapper, setBasket } = createTestWrapper(undefined);

            const { result } = renderHook(() => usePickup(), {
                wrapper: TestWrapper,
            });

            if (result.current) {
                expect(result.current.pickupBasketItems.size).toBe(0);
            }

            // Change basket to one with items
            const newBasket = createMockBasketWithPickupItems([
                { productId: 'product-1', inventoryId: 'inventory-A', storeId: 'store-1' },
            ]);
            act(() => {
                setBasket(newBasket);
            });

            if (result.current) {
                expect(result.current.pickupBasketItems.size).toBe(1);
                expect(result.current.pickupBasketItems.get('product-1')).toEqual({
                    inventoryId: 'inventory-A',
                    storeId: 'store-1',
                });
            }
        });

        it('updates state when basket changes with different content', () => {
            const basket = createMockBasketWithPickupItems([
                { productId: 'product-1', inventoryId: 'inventory-A', storeId: 'store-1' },
            ]);
            const { TestWrapper, setBasket } = createTestWrapper(basket);

            const { result } = renderHook(() => usePickup(), {
                wrapper: TestWrapper,
            });

            if (result.current) {
                expect(result.current.pickupBasketItems.size).toBe(1);
                expect(result.current.pickupBasketItems.get('product-1')).toEqual({
                    inventoryId: 'inventory-A',
                    storeId: 'store-1',
                });
            }

            // Change basket with different content
            const newBasket = createMockBasketWithPickupItems([
                { productId: 'product-2', inventoryId: 'inventory-B', storeId: 'store-2' },
                { productId: 'product-3', inventoryId: 'inventory-C', storeId: 'store-3' },
            ]);
            act(() => {
                setBasket(newBasket);
            });

            if (result.current) {
                expect(result.current.pickupBasketItems.size).toBe(2);
                expect(result.current.pickupBasketItems.get('product-1')).toBeUndefined();
                expect(result.current.pickupBasketItems.get('product-2')).toEqual({
                    inventoryId: 'inventory-B',
                    storeId: 'store-2',
                });
                expect(result.current.pickupBasketItems.get('product-3')).toEqual({
                    inventoryId: 'inventory-C',
                    storeId: 'store-3',
                });
            }
        });

        it('updates state when basket changes with same productId but different storeId', () => {
            const basket = createMockBasketWithPickupItems([
                { productId: 'product-1', inventoryId: 'inventory-A', storeId: 'store-1' },
            ]);
            const { TestWrapper, setBasket } = createTestWrapper(basket);

            const { result } = renderHook(() => usePickup(), {
                wrapper: TestWrapper,
            });

            if (result.current) {
                expect(result.current.pickupBasketItems.get('product-1')?.storeId).toBe('store-1');
            }

            // Change basket with same productId but different storeId
            const newBasket = createMockBasketWithPickupItems([
                { productId: 'product-1', inventoryId: 'inventory-A', storeId: 'store-2' },
            ]);
            act(() => {
                setBasket(newBasket);
            });

            if (result.current) {
                expect(result.current.pickupBasketItems.size).toBe(1);
                expect(result.current.pickupBasketItems.get('product-1')).toEqual({
                    inventoryId: 'inventory-A',
                    storeId: 'store-2',
                });
            }
        });

        it('updates state when basket changes with same productId but different inventoryId', () => {
            const basket = createMockBasketWithPickupItems([
                { productId: 'product-1', inventoryId: 'inventory-A', storeId: 'store-1' },
            ]);
            const { TestWrapper, setBasket } = createTestWrapper(basket);

            const { result } = renderHook(() => usePickup(), {
                wrapper: TestWrapper,
            });

            if (result.current) {
                expect(result.current.pickupBasketItems.get('product-1')?.inventoryId).toBe('inventory-A');
            }

            // Change basket with same productId but different inventoryId
            const newBasket = createMockBasketWithPickupItems([
                { productId: 'product-1', inventoryId: 'inventory-B', storeId: 'store-1' },
            ]);
            act(() => {
                setBasket(newBasket);
            });

            if (result.current) {
                expect(result.current.pickupBasketItems.size).toBe(1);
                expect(result.current.pickupBasketItems.get('product-1')).toEqual({
                    inventoryId: 'inventory-B',
                    storeId: 'store-1',
                });
            }
        });

        it('does not update state when basket has same content (different reference)', () => {
            const basket = createMockBasketWithPickupItems([
                { productId: 'product-1', inventoryId: 'inventory-A', storeId: 'store-1' },
            ]);
            const { TestWrapper, setBasket } = createTestWrapper(basket);

            const { result } = renderHook(() => usePickup(), {
                wrapper: TestWrapper,
            });

            if (!result.current) return;

            // Change basket to a new basket with same content (cache should prevent update)
            const newBasket = createMockBasketWithPickupItems([
                { productId: 'product-1', inventoryId: 'inventory-A', storeId: 'store-1' },
            ]);
            act(() => {
                setBasket(newBasket);
            });

            // State should still have the same content (cache returns same Map instance)
            if (result.current) {
                expect(result.current.pickupBasketItems.size).toBe(1);
                expect(result.current.pickupBasketItems.get('product-1')).toEqual({
                    inventoryId: 'inventory-A',
                    storeId: 'store-1',
                });
            }
        });

        it('syncs state when items are manually added and then basket changes', () => {
            const { TestWrapper, setBasket } = createTestWrapper(undefined);

            const { result } = renderHook(() => usePickup(), {
                wrapper: TestWrapper,
            });

            // Manually add an item
            act(() => {
                if (result.current) {
                    result.current.addItem('product-1', 'inventory-A', 'store-1');
                }
            });

            if (result.current) {
                expect(result.current.pickupBasketItems.size).toBe(1);
            }

            // Change basket - should override manual changes
            const newBasket = createMockBasketWithPickupItems([
                { productId: 'product-2', inventoryId: 'inventory-B', storeId: 'store-2' },
            ]);
            act(() => {
                setBasket(newBasket);
            });

            if (result.current) {
                expect(result.current.pickupBasketItems.size).toBe(1);
                expect(result.current.pickupBasketItems.get('product-1')).toBeUndefined();
                expect(result.current.pickupBasketItems.get('product-2')).toEqual({
                    inventoryId: 'inventory-B',
                    storeId: 'store-2',
                });
            }
        });

        it('handles multiple sync updates correctly', () => {
            const { TestWrapper, setBasket } = createTestWrapper(undefined);

            const { result } = renderHook(() => usePickup(), {
                wrapper: TestWrapper,
            });

            // First update
            const basket1 = createMockBasketWithPickupItems([
                { productId: 'product-1', inventoryId: 'inventory-A', storeId: 'store-1' },
            ]);
            act(() => {
                setBasket(basket1);
            });

            if (result.current) {
                expect(result.current.pickupBasketItems.size).toBe(1);
            }

            // Second update
            const basket2 = createMockBasketWithPickupItems([
                { productId: 'product-1', inventoryId: 'inventory-A', storeId: 'store-1' },
                { productId: 'product-2', inventoryId: 'inventory-B', storeId: 'store-2' },
            ]);
            act(() => {
                setBasket(basket2);
            });

            if (result.current) {
                expect(result.current.pickupBasketItems.size).toBe(2);
            }

            // Third update - remove one item
            const basket3 = createMockBasketWithPickupItems([
                { productId: 'product-2', inventoryId: 'inventory-B', storeId: 'store-2' },
            ]);
            act(() => {
                setBasket(basket3);
            });

            if (result.current) {
                expect(result.current.pickupBasketItems.size).toBe(1);
                expect(result.current.pickupBasketItems.get('product-1')).toBeUndefined();
                expect(result.current.pickupBasketItems.get('product-2')).toEqual({
                    inventoryId: 'inventory-B',
                    storeId: 'store-2',
                });
            }
        });
    });
});
