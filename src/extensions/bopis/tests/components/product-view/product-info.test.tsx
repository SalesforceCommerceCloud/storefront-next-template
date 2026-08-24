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

// Testing libraries
import { render, screen } from '@testing-library/react';
import { describe, test, expect } from 'vitest';
// React Router
import { createMemoryRouter, RouterProvider } from 'react-router';
// Components
import ProductInfo from '@/components/product-view/product-info';
import ProductViewProvider from '@/providers/product-view';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
// mock data
import { masterProduct as mockProduct } from '@/components/__mocks__/master-variant-product';

describe('ProductInfo - BOPIS', () => {
    describe('delivery options', () => {
        test('should render DeliveryOptions in normal (add) mode', () => {
            const simpleProduct = {
                ...mockProduct,
                variationAttributes: [],
            };

            // Using createMemoryRouter in framework mode is fine
            // because both framework and data routers share the same underlying architecture, so it provides a valid navigation context for hooks and <Link>.
            // Even though it's listed under "data routers," it fully supports testing non-route components that rely on router behavior.
            const router = createMemoryRouter(
                [
                    {
                        path: '/product/:productId',
                        element: (
                            <AllProvidersWrapper>
                                <ProductViewProvider product={simpleProduct}>
                                    <ProductInfo product={simpleProduct} />
                                </ProductViewProvider>
                            </AllProvidersWrapper>
                        ),
                    },
                    // Catch-all route to prevent 404 errors when navigating
                    {
                        path: '*',
                        element: <div>Navigated</div>,
                    },
                ],
                {
                    initialEntries: ['/product/test-product'],
                }
            );
            render(<RouterProvider router={router} />);

            // DeliveryOptions should be rendered in normal mode
            // Check for text that exists in DeliveryOptions component
            expect(screen.getByText(/Deliver to/i)).toBeInTheDocument();
            expect(screen.getByText(/Free pickup in/i)).toBeInTheDocument();
        });

        test('should not render DeliveryOptions in edit mode without basketPickupStore', () => {
            const simpleProduct = {
                ...mockProduct,
                variationAttributes: [],
            };

            // In edit mode without basket context/itemId, basketPickupStore is undefined
            const router = createMemoryRouter(
                [
                    {
                        path: '/product/:productId',
                        element: (
                            <AllProvidersWrapper>
                                <ProductViewProvider product={simpleProduct} mode="edit">
                                    <ProductInfo product={simpleProduct} />
                                </ProductViewProvider>
                            </AllProvidersWrapper>
                        ),
                    },
                ],
                {
                    initialEntries: ['/product/test-product'],
                }
            );
            render(<RouterProvider router={router} />);

            // DeliveryOptions hidden in edit mode when no basket pickup store exists
            expect(screen.queryByText(/Deliver to/i)).not.toBeInTheDocument();
            expect(screen.queryByText(/Free pickup in/i)).not.toBeInTheDocument();
        });

        test('should not render DeliveryOptions while selected variant inventory loads', () => {
            const simpleProduct = {
                ...mockProduct,
                variationAttributes: [],
            };
            const router = createMemoryRouter(
                [
                    {
                        path: '/product/:productId',
                        element: (
                            <AllProvidersWrapper>
                                <ProductViewProvider product={simpleProduct} isVariantInventoryLoading>
                                    <ProductInfo product={simpleProduct} isVariantInventoryLoading />
                                </ProductViewProvider>
                            </AllProvidersWrapper>
                        ),
                    },
                ],
                {
                    initialEntries: ['/product/test-product'],
                }
            );
            render(<RouterProvider router={router} />);

            expect(screen.queryByText(/Deliver to/i)).not.toBeInTheDocument();
            expect(screen.queryByText(/Free pickup in/i)).not.toBeInTheDocument();
        });
    });
});
