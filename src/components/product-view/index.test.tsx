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
import { vi, test, beforeEach } from 'vitest';
// Commerce SDK
import type { ShopperProducts } from '@/scapi';
// React Router
import { createMemoryRouter, RouterProvider } from 'react-router';
// Components
import ProductView from './index';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { createConfigWrapper, mockAltSiteObject } from '@/test-utils/config';

// Create a wrapper with default config
const defaultConfigWrapper = createConfigWrapper({
    app: {
        site: {
            locale: mockAltSiteObject.defaultLocale,
            currency: mockAltSiteObject.defaultCurrency,
            features: {
                passwordlessLogin: {
                    callbackUri: '/passwordless-login-callback',
                    landingUri: '/passwordless-login-landing',
                },
                socialLogin: { enabled: true, providers: ['Apple', 'Google'] },
                socialShare: { enabled: true, providers: ['Twitter', 'Facebook', 'LinkedIn', 'Email'] },
                guestCheckout: true,
            },
        },
    },
} as any);

const renderProductView = (props: React.ComponentProps<typeof ProductView>) => {
    // Using createMemoryRouter in framework mode is fine
    // because both framework and data routers share the same underlying architecture, so it provides a valid navigation context for hooks and <Link>.
    // Even though it's listed under "data routers," it fully supports testing non-route components that rely on router behavior.
    const router = createMemoryRouter(
        [
            {
                path: '/product/:productId',
                element: (
                    <AllProvidersWrapper>
                        <ProductView {...props} />
                    </AllProvidersWrapper>
                ),
            },
        ],
        { initialEntries: ['/product/test-product'] }
    );
    return render(<RouterProvider router={router} />, { wrapper: defaultConfigWrapper });
};

describe('ProductView', () => {
    const mockProduct: ShopperProducts.schemas['Product'] = {
        id: 'test-product',
        name: 'Test Product',
        shortDescription: 'Test product description',
        price: 99.99,
        type: { item: true },
        imageGroups: [
            {
                viewType: 'large',
                images: [
                    {
                        link: 'https://example.com/image1.jpg',
                        disBaseLink: 'https://example.com/image1.jpg',
                        alt: 'Image 1',
                    },
                    {
                        link: 'https://example.com/image2.jpg',
                        disBaseLink: 'https://example.com/image2.jpg',
                        alt: 'Image 2',
                    },
                ],
            },
            {
                viewType: 'swatch',
                variationAttributes: [
                    {
                        id: 'color',
                        values: [{ value: 'red', name: 'Red' }],
                    },
                ],
                images: [
                    {
                        link: 'https://example.com/red-swatch.jpg',
                        disBaseLink: 'https://example.com/red-swatch.jpg',
                        alt: 'Red swatch',
                    },
                ],
            },
        ],
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('regular product rendering', () => {
        test('should render regular product with image gallery and product info', () => {
            renderProductView({ product: mockProduct });

            // Check that regular product components are rendered
            // ImageGallery: Should have images displayed
            const images = screen.getAllByRole('img');
            expect(images.length).toBeGreaterThan(0);

            // ProductInfo: Should show product name and price
            expect(screen.getByText('Test Product')).toBeInTheDocument();
            expect(screen.getByText(`$99.99`)).toBeInTheDocument();
        });

        test('should pass correct props to ProductInfo', () => {
            renderProductView({ product: mockProduct });

            // Check that ProductInfo is rendered with correct product data
            expect(screen.getByText('Test Product')).toBeInTheDocument();
            expect(screen.getByText('Test product description')).toBeInTheDocument();

            // Check that it's rendering as a regular product (has product info elements)
            expect(screen.getByText(`$99.99`)).toBeInTheDocument();
        });

        test('should pass gallery images to ImageGallery', () => {
            renderProductView({ product: mockProduct });

            // Check that images are rendered
            const images = screen.getAllByRole('img');
            expect(images.length).toBeGreaterThan(0);

            // The main image carries its descriptive alt. Thumbnails are decorative
            // (alt="") with the description moved onto the thumbnail button label, so
            // each additional image is reachable as a labelled button, not an alt.
            expect(screen.getAllByAltText('Image 1').length).toBeGreaterThan(0);
            expect(screen.getByRole('button', { name: 'Product image 2 of 2' })).toBeInTheDocument();
        });
    });

    describe('product type detection', () => {
        test('should handle product without type property', () => {
            const productWithoutType = { ...mockProduct, type: undefined };
            renderProductView({ product: productWithoutType });

            // Should render as regular product with image gallery and product info
            const images = screen.getAllByRole('img');
            expect(images.length).toBeGreaterThan(0);
            expect(screen.getByText('Test Product')).toBeInTheDocument();
            expect(screen.getByText(`$99.99`)).toBeInTheDocument();
        });

        test('should handle product with empty type object', () => {
            const productWithEmptyType = { ...mockProduct, type: {} };
            renderProductView({ product: productWithEmptyType });

            // Should render as regular product with image gallery and product info
            const images = screen.getAllByRole('img');
            expect(images.length).toBeGreaterThan(0);
            expect(screen.getByText('Test Product')).toBeInTheDocument();
            expect(screen.getByText(`$99.99`)).toBeInTheDocument();
        });

        test('should handle product with type containing false values', () => {
            const productWithFalseTypes = {
                ...mockProduct,
                type: { set: false, bundle: false, item: true },
            };
            renderProductView({ product: productWithFalseTypes });

            // Should render as regular product with image gallery and product info
            const images = screen.getAllByRole('img');
            expect(images.length).toBeGreaterThan(0);
            expect(screen.getByText('Test Product')).toBeInTheDocument();
            expect(screen.getByText(`$99.99`)).toBeInTheDocument();
        });
    });
});
