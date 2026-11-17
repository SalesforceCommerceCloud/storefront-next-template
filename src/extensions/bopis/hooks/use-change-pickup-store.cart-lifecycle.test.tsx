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
import { useEffect, type ReactNode } from 'react';
import { Outlet, createMemoryRouter, RouterProvider, useLoaderData } from 'react-router';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StoreLocatorProvider, { useStoreLocator } from '@/extensions/store-locator/providers/store-locator';
import { useStoreSelection } from '@/extensions/store-locator/providers/selection';
import CartPickup from '@/extensions/bopis/components/cart-pickup';
import { resourceRoutes } from '@/route-paths';
import { shouldRevalidate } from '@/lib/revalidation/routes/cart';
import Cart from '@/routes/_app.cart';
import BasketProvider, { useBasket } from '@/providers/basket';
import { ConfigWrapper } from '@/test-utils/config';

const evidence = vi.hoisted(() => ({ toast: vi.fn(), mounts: 0, unmounts: 0 }));
vi.mock('@salesforce/storefront-next-runtime/site-context', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@salesforce/storefront-next-runtime/site-context')>()),
    useSite: () => ({ site: { id: 'site' }, currency: 'USD' }),
}));
vi.mock('@/components/toast', () => ({ useToast: () => ({ addToast: evidence.toast }) }));
vi.mock('@/lib/config.ui', () => ({ uiConfig: { pages: { cart: { showRecommendations: false } } } }));
vi.mock('@/components/seo-meta', () => ({ SeoMeta: () => null }));
vi.mock('@/components/cart/cart-skeleton', () => ({ default: () => <div>Loading cart</div> }));
vi.mock('@/components/cart/cart-load-error', () => ({ CartLoadError: () => <div>Cart error</div> }));
vi.mock('@/extensions/bopis/context/pickup-context', () => ({
    default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/cart/cart-content', () => ({ default: () => <PickupCaller /> }));

/** Actual compatibility adapter, using the unchanged pickup hook. */
function PickupCaller() {
    useEffect(() => {
        evidence.mounts++;
        return () => {
            evidence.unmounts++;
        };
    }, []);
    return <CartPickup store={{ id: 'A', inventoryId: 'inventory-A' }} pickupCount={1} totalCount={1} />;
}

function BasketPublication() {
    const basket = useBasket();
    return <output data-testid="basket-store">{basket?.shipments?.[0]?.c_fromStoreId as string}</output>;
}

function Chooser() {
    const { select } = useStoreSelection();
    const open = useStoreLocator((state) => state.openChooser);
    return (
        <>
            <button onClick={() => open()}>Header chooser</button>
            <button onClick={() => select({ id: 'B', inventoryId: 'untrusted-draft' })}>Confirm B</button>
            <button onClick={() => select({ id: 'A', inventoryId: 'untrusted-draft' })}>Confirm A</button>
        </>
    );
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((yes) => {
        resolve = yes;
    });
    return { promise, resolve };
}

describe('unchanged pickup hook with the production deferred cart tree', () => {
    it.each([
        { remount: false, beforeConfirm: true, result: 'success', chooser: 'cart', selected: 'B' },
        { remount: false, result: 'success', chooser: 'cart', selected: 'B' },
        { remount: true, result: 'success', chooser: 'cart', selected: 'B' },
        { remount: false, result: 'failure', chooser: 'cart', selected: 'B' },
        { remount: false, result: 'success', chooser: 'cart', selected: 'A' },
        { remount: false, result: 'success', chooser: 'header', selected: 'B' },
    ])('preserves baseline mounted dispatch/feedback/publication and inherited remount deficiency: %j', async ({
        remount,
        beforeConfirm,
        result,
        chooser,
        selected,
    }) => {
        evidence.mounts = 0;
        evidence.unmounts = 0;
        evidence.toast.mockClear();
        const wishlist = deferred<string[]>();
        if (!remount && !beforeConfirm) wishlist.resolve([]);
        const pickup = deferred<{ success: boolean; error?: { message: string } }>();
        let persistedStore = 'A';
        const pickupAction = vi.fn(async ({ request }: { request: Request }) => {
            expect(request.method).toBe('PATCH');
            expect(Object.fromEntries(await request.formData())).toEqual({
                storeId: 'B',
                inventoryId: 'canonical-inventory',
                storeName: 'Canonical B',
            });
            const response = await pickup.promise;
            if (response.success) persistedStore = 'B';
            return response;
        });
        const basketData = {
            basket: { basketId: 'basket-A', productItems: [{ itemId: 'item', productId: 'product', quantity: 2 }] },
            productsByItemId: {},
            bonusProductsById: {},
            promotions: {},
            storesByStoreId: {},
        };
        const revalidation = deferred<void>();
        const cartData = () => ({
            basketDataPromise: Promise.resolve(basketData),
            wishlistProductIdsPromise: wishlist.promise,
            cartMayAlsoLikePromise: Promise.resolve({}),
            cartRecentlyViewedPromise: Promise.resolve({}),
            ruleBasedBonusProductsPromise: Promise.resolve({}),
            basketSnapshot: null,
            pageUrl: 'http://localhost/cart',
        });
        const cartLoader = vi.fn(async () => {
            if (pickupAction.mock.calls.length > 0) await revalidation.promise;
            return cartData();
        });
        const router = createMemoryRouter(
            [
                {
                    loader: async () => {
                        if (persistedStore === 'B') await revalidation.promise;
                        return {
                            basketId: 'basket-A',
                            shipments: [{ shipmentId: 'pickup', c_fromStoreId: persistedStore }],
                        };
                    },
                    Component: () => (
                        <ConfigWrapper>
                            <BasketProvider basket={useLoaderData()}>
                                <StoreLocatorProvider selectedStoreInfo={{ id: 'A', inventoryId: 'inventory-A' }}>
                                    <BasketPublication />
                                    <Chooser />
                                    <Outlet />
                                </StoreLocatorProvider>
                            </BasketProvider>
                        </ConfigWrapper>
                    ),
                    children: [{ path: '/cart', Component: Cart, loader: cartLoader, shouldRevalidate }],
                },
                {
                    path: resourceRoutes.setSelectedStore,
                    action: async ({ request }) => ({
                        success: true,
                        selectedStoreInfo: {
                            id: (await request.formData()).get('storeId'),
                            inventoryId: 'canonical-inventory',
                            name: 'Canonical B',
                        },
                    }),
                },
                { path: resourceRoutes.cartPickupStoreUpdate, action: pickupAction },
            ],
            { initialEntries: ['/cart'] }
        );
        render(<RouterProvider router={router} />);
        await screen.findByRole('button', { name: 'Change Store' });
        fireEvent.click(screen.getByText(chooser === 'cart' ? 'Change Store' : 'Header chooser'));
        if (beforeConfirm) {
            const mountsBefore = evidence.mounts;
            await act(async () => {
                wishlist.resolve([]);
                await wishlist.promise;
            });
            await waitFor(() => expect(evidence.mounts).toBeGreaterThan(mountsBefore));
            expect(evidence.unmounts).toBeGreaterThan(0);
            expect(pickupAction).not.toHaveBeenCalled();
        }
        fireEvent.click(screen.getByText(`Confirm ${selected}`));
        if (chooser === 'header' || selected === 'A') {
            await waitFor(() => expect(cartLoader).toHaveBeenCalledTimes(2));
            expect(pickupAction).not.toHaveBeenCalled();
            expect(evidence.toast).not.toHaveBeenCalled();
            expect(screen.getByTestId('basket-store')).toHaveTextContent('A');
            router.dispose();
            return;
        }
        await waitFor(() => expect(pickupAction).toHaveBeenCalledTimes(1));
        const mountsBefore = evidence.mounts;
        if (remount) {
            await act(async () => {
                wishlist.resolve([]);
                await wishlist.promise;
            });
            await waitFor(() => expect(evidence.mounts).toBeGreaterThan(mountsBefore));
            expect(evidence.unmounts).toBeGreaterThan(0);
        }
        await act(async () => {
            pickup.resolve(
                result === 'success' ? { success: true } : { success: false, error: { message: 'Pickup failed' } }
            );
            await pickup.promise;
        });
        expect(pickupAction).toHaveBeenCalledTimes(1);
        try {
            if (remount) {
                // Independently reproduced on d038ffbc7: caller loses its anonymous fetcher observer.
                await waitFor(() => expect(cartLoader).toHaveBeenCalledTimes(3));
                expect(evidence.toast).not.toHaveBeenCalled();
            } else {
                await waitFor(() =>
                    expect(evidence.toast).toHaveBeenCalledWith(
                        result === 'success' ? expect.any(String) : 'Pickup failed',
                        result === 'success' ? 'success' : 'error'
                    )
                );
                expect(evidence.toast).toHaveBeenCalledTimes(1);
            }
        } finally {
            revalidation.resolve();
            await waitFor(() =>
                expect(screen.getByTestId('basket-store')).toHaveTextContent(result === 'success' ? 'B' : 'A')
            );
            expect(pickupAction).toHaveBeenCalledTimes(1);
            router.dispose();
        }
    });
});
