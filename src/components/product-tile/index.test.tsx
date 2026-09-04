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
import { vi, test, describe, expect, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';

import { ProductTile } from './index';
import type { ShopperProducts, ShopperSearch } from '@/scapi';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { mockConfig } from '@/test-utils/config';
import type { AppConfig } from '@/types/config';
import { masterProduct } from '@/components/__mocks__/master-variant-product';

// Mock only the network boundary. `useScapiFetcher` is what the CartItemModal
// uses to load product data after the user clicks quick-add; everything else
// renders for real.
const mockLoad = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/use-scapi-fetcher', () => ({
    useScapiFetcher: () => ({
        load: mockLoad,
        data: masterProduct,
        state: 'idle',
        success: true,
    }),
}));

// Spy on the lazy-load trigger while keeping the real provider/store behavior, so we can
// assert tile-level intent (not just heart-icon intent) kicks the load.
const loadSpy = vi.fn();
vi.mock('@/providers/wishlist', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/providers/wishlist')>();
    return { ...actual, useWishlistLoader: () => loadSpy };
});

// Drives the Page Designer design-mode gate on the no-product empty state. Partial mock (not a full
// mock) so `createReactAdapter` and the other real exports the runtime needs stay intact.
let mockIsDesignMode = false;
vi.mock('@salesforce/storefront-next-runtime/design/react/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@salesforce/storefront-next-runtime/design/react/core')>();
    return { ...actual, usePageDesignerMode: () => ({ isDesignMode: mockIsDesignMode }) };
});

// Drives the "tiles link to the master PDP instead of the represented variant" flag.
let mockTileLinksToMaster = false;
vi.mock('@/lib/config.ui', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/config.ui')>();
    return {
        ...actual,
        uiConfig: {
            ...actual.uiConfig,
            pages: {
                ...actual.uiConfig.pages,
                category: {
                    ...actual.uiConfig.pages.category,
                    get tileLinksToMasterProduct() {
                        return mockTileLinksToMaster;
                    },
                },
                product: {
                    ...actual.uiConfig.pages.product,
                    showRatingAverage: false,
                },
            },
        },
    };
});

// @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS
vi.mock('@/extensions/ratings-reviews/providers/product-reviews-context', () => ({
    ProductReviewsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useProductReviews: () => ({
        reviewsSummary: null,
        reviewsSummaryLoading: false,
        reviews: [],
        reviewsLoading: false,
        loadReviewsIfNeeded: () => {},
        aiSummary: '',
        addReviewOptimistic: () => {},
        removeReviewOptimistic: () => {},
        expandReviews: () => {},
        registerExpand: () => {},
        registerOnExpanded: () => {},
        triggerOnExpanded: () => {},
    }),
}));
// @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS

const mockMasterProduct: ShopperSearch.schemas['ProductSearchHit'] = {
    productId: masterProduct.id,
    productName: 'Charcoal Flat Front Athletic Fit Shadow Striped Wool Suit',
    price: 299.99,
    productType: { master: true },
    representedProduct: { id: '750518699578M' },
    variants: [
        { productId: '750518699578M', variationValues: { color: 'CHARCWL', size: '036', width: 'S' } },
        { productId: '750518699585M', variationValues: { color: 'CHARCWL', size: '038', width: 'V' } },
    ],
    variationAttributes: masterProduct.variationAttributes as ShopperProducts.schemas['VariationAttribute'][],
    imageGroups: masterProduct.imageGroups,
};

const mockSingleVariantProduct: ShopperSearch.schemas['ProductSearchHit'] = {
    productId: 'simple-001',
    productName: 'Simple Test Product',
    price: 49.99,
    variationAttributes: [
        {
            id: 'color',
            name: 'Color',
            values: [
                { value: 'navy', name: 'Navy' },
                { value: 'red', name: 'Red' },
            ],
        },
    ],
    imageGroups: [
        {
            viewType: 'medium',
            images: [
                {
                    alt: 'Simple Test Product',
                    link: 'https://example.com/simple.jpg',
                    disBaseLink: 'https://example.com/simple.jpg',
                },
            ],
        },
    ],
};

const renderTile = (
    props: Partial<React.ComponentProps<typeof ProductTile>> = {},
    wrapperProps: { config?: AppConfig; currency?: string } = {}
) => {
    const router = createMemoryRouter(
        [
            {
                path: '/test',
                element: (
                    <AllProvidersWrapper {...wrapperProps}>
                        <ProductTile product={mockSingleVariantProduct} {...props} />
                    </AllProvidersWrapper>
                ),
            },
            { path: '*', element: <div>Navigated</div> },
        ],
        { initialEntries: ['/test'] }
    );
    return render(<RouterProvider router={router} />);
};

const getDialogVariationRadio = async (
    dialog: HTMLElement,
    user: ReturnType<typeof userEvent.setup>,
    groupName: string,
    optionName: string | RegExp
) => {
    const dialogQueries = within(dialog);
    const accessibleGroupName = groupName === 'Color' ? /^colou?r/i : new RegExp(`^${groupName}(?::|$)`, 'i');
    const existingGroup = dialogQueries.queryByRole('radiogroup', { name: accessibleGroupName });
    if (existingGroup) {
        return within(existingGroup).getByRole('radio', { name: optionName });
    }

    const summary = dialogQueries
        .getAllByText(groupName, { exact: true })
        .map((element) => element.closest('summary'))
        .find((element): element is HTMLElement => element !== null);
    if (!summary) {
        throw new Error(`Could not find the ${groupName} collapsible swatch section`);
    }
    await user.click(summary);

    return within(await dialogQueries.findByRole('radiogroup', { name: accessibleGroupName })).getByRole('radio', {
        name: optionName,
    });
};

describe('ProductTile — rendering', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('renders product name as a heading linking to the PDP', () => {
        renderTile();
        const heading = screen.getByRole('heading', { name: 'Simple Test Product' });
        expect(heading).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Simple Test Product' })).toHaveAttribute(
            'href',
            '/global/en-GB/product/simple-001'
        );
    });

    test('renders the product price', () => {
        renderTile();
        expect(screen.getByText('$49.99')).toBeInTheDocument();
    });

    test('renders the product SKU', () => {
        renderTile();
        expect(screen.getByText(/simple-001/)).toBeInTheDocument();
    });

    test('renders sale badge when the product is on sale', () => {
        const productOnSale = {
            ...mockSingleVariantProduct,
            representedProduct: {
                id: 'v1',
                c_isSale: true,
            } as ShopperSearch.schemas['ProductSearchHit']['representedProduct'],
        };
        renderTile({ product: productOnSale });
        expect(screen.getByText('Sale')).toBeInTheDocument();
    });

    test('does not render a badge for a product without badge flags', () => {
        renderTile();
        expect(screen.queryByText('Sale')).not.toBeInTheDocument();
        expect(screen.queryByText('New')).not.toBeInTheDocument();
    });

    test('renders topCategoryName when provided', () => {
        renderTile({ topCategoryName: 'Women' });
        expect(screen.getByText('Women')).toBeInTheDocument();
    });

    test('renders the pickup-available tooltip when showPickupAvailable is true', () => {
        renderTile({ showPickupAvailable: true });
        expect(screen.getByText('Pickup Available')).toBeInTheDocument();
    });

    test('does not render the pickup tooltip by default', () => {
        renderTile();
        expect(screen.queryByText('Pickup Available')).not.toBeInTheDocument();
    });

    test('renders a quick-add button with the default label', () => {
        renderTile();
        expect(screen.getByRole('button', { name: /quick add/i })).toBeInTheDocument();
    });

    test('renders a quick-add button with a custom label', () => {
        renderTile({ quickAddLabel: 'Fast Add' });
        expect(screen.getByRole('button', { name: /fast add/i })).toBeInTheDocument();
    });

    test('places the quick-add as an absolute overlay over the image by default', () => {
        renderTile();
        // Default 'overlay' placement: the button lives in the absolutely-positioned hover overlay.
        expect(screen.getByRole('button', { name: /quick add/i }).closest('.absolute')).not.toBeNull();
    });

    test('places the quick-add inline at the tile bottom when quickAddPlacement="inline"', () => {
        renderTile({ quickAddPlacement: 'inline' });
        // Inline placement: the button is in-flow in the info section, not the absolute overlay.
        expect(screen.getByRole('button', { name: /quick add/i }).closest('.absolute')).toBeNull();
    });
});

describe('ProductTile — lazy wishlist load on tile intent', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // The heart is opacity-0 until tile hover, so the trigger must live on the tile itself.
    const getTile = (): HTMLElement => {
        const card = screen.getByText('Simple Test Product').closest('.product-card');
        expect(card).not.toBeNull();
        return card as HTMLElement;
    };

    test('triggers the load on pointerEnter of the tile (not just the heart)', () => {
        renderTile();
        fireEvent.pointerEnter(getTile());
        expect(loadSpy).toHaveBeenCalled();
    });

    test('triggers the load on focus within the tile (keyboard)', () => {
        renderTile();
        fireEvent.focus(getTile());
        expect(loadSpy).toHaveBeenCalled();
    });

    test('triggers the load on touchStart of the tile (mobile)', () => {
        renderTile();
        fireEvent.touchStart(getTile());
        expect(loadSpy).toHaveBeenCalled();
    });
});

describe('ProductTile — PDP URL', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockTileLinksToMaster = false;
    });

    test('master product links to the master (no pid) when tileLinksToMasterProduct is enabled', () => {
        mockTileLinksToMaster = true;
        renderTile({ product: mockMasterProduct });
        expect(screen.getByRole('link', { name: mockMasterProduct.productName as string })).toHaveAttribute(
            'href',
            `/global/en-GB/product/${mockMasterProduct.productId}`
        );
    });

    test('standard product links to the product route without a pid', () => {
        renderTile();
        expect(screen.getByRole('link', { name: 'Simple Test Product' })).toHaveAttribute(
            'href',
            '/global/en-GB/product/simple-001'
        );
    });

    test('master product links to the product route with the represented variant pid', () => {
        renderTile({ product: mockMasterProduct });
        expect(screen.getByRole('link', { name: mockMasterProduct.productName as string })).toHaveAttribute(
            'href',
            `/global/en-GB/product/${mockMasterProduct.productId}?pid=750518699578M`
        );
    });

    test('bundle product links without a pid', () => {
        renderTile({ product: { ...mockMasterProduct, productType: { bundle: true } } });
        expect(screen.getByRole('link', { name: mockMasterProduct.productName as string })).toHaveAttribute(
            'href',
            `/global/en-GB/product/${mockMasterProduct.productId}`
        );
    });

    test('set product links without a pid', () => {
        renderTile({ product: { ...mockMasterProduct, productType: { set: true } } });
        expect(screen.getByRole('link', { name: mockMasterProduct.productName as string })).toHaveAttribute(
            'href',
            `/global/en-GB/product/${mockMasterProduct.productId}`
        );
    });

    test('calls handleProductClick when the product name link is clicked', async () => {
        const user = userEvent.setup();
        const handleProductClick = vi.fn();
        renderTile({ handleProductClick });

        await user.click(screen.getByRole('link', { name: 'Simple Test Product' }));

        expect(handleProductClick).toHaveBeenCalledWith(mockSingleVariantProduct);
    });
});

describe('ProductTile — color swatches', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('renders a swatch link for each color value', async () => {
        renderTile();
        // Locale-agnostic: query by ARIA role with a regex that matches both en-US ("colors") and en-GB ("colours").
        const swatchRegion = await screen.findByRole('group', { name: /available colou?rs/i });
        expect(within(swatchRegion).getByRole('link', { name: /Navy/ })).toBeInTheDocument();
        expect(within(swatchRegion).getByRole('link', { name: /Red/ })).toBeInTheDocument();
    });

    test('does not render a swatch region when the product has no variation attributes', async () => {
        const productWithoutVariations: ShopperSearch.schemas['ProductSearchHit'] = {
            productId: mockSingleVariantProduct.productId,
            productName: mockSingleVariantProduct.productName,
            price: mockSingleVariantProduct.price,
            imageGroups: mockSingleVariantProduct.imageGroups,
        };
        renderTile({ product: productWithoutVariations });
        // Wait a tick for any lazy suspense to settle before asserting absence.
        await Promise.resolve();
        expect(screen.queryByRole('group', { name: /available colou?rs/i })).not.toBeInTheDocument();
    });

    test('renders swatches synthesized from variants when variationAttributes is omitted', async () => {
        const productWithVariantsOnly: ShopperSearch.schemas['ProductSearchHit'] = {
            productId: 'master-001',
            productName: 'Trainer',
            price: 129.99,
            productType: { master: true },
            representedProduct: { id: 'master-001-red' },
            variants: [
                { productId: 'master-001-red', variationValues: { color: 'RED', size: '10' } },
                { productId: 'master-001-blu', variationValues: { color: 'BLU', size: '10' } },
            ],
            imageGroups: [
                {
                    viewType: 'swatch',
                    images: [
                        {
                            link: 'https://example.com/swatch-red.jpg',
                            disBaseLink: 'https://example.com/swatch-red.jpg',
                            alt: 'Red swatch',
                        },
                    ],
                    variationAttributes: [{ id: 'color', values: [{ value: 'RED' }] }],
                },
                {
                    viewType: 'swatch',
                    images: [
                        {
                            link: 'https://example.com/swatch-blu.jpg',
                            disBaseLink: 'https://example.com/swatch-blu.jpg',
                            alt: 'Blue swatch',
                        },
                    ],
                    variationAttributes: [{ id: 'color', values: [{ value: 'BLU' }] }],
                },
            ],
        };
        renderTile({ product: productWithVariantsOnly });

        const swatchRegion = await screen.findByRole('group', { name: /available colou?rs/i });
        const swatchLinks = within(swatchRegion).getAllByRole('link');
        expect(swatchLinks).toHaveLength(2);
        expect(swatchLinks[0]).toHaveAttribute('href', '/global/en-GB/product/master-001?color=RED');
        expect(swatchLinks[1]).toHaveAttribute('href', '/global/en-GB/product/master-001?color=BLU');
    });
});

describe('ProductTile — swatch hover preview', () => {
    let originalMatchMedia: typeof globalThis.matchMedia;

    beforeEach(() => {
        vi.clearAllMocks();
        originalMatchMedia = globalThis.matchMedia;
    });

    afterEach(() => {
        globalThis.matchMedia = originalMatchMedia;
    });

    const mockDesktop = (matches: boolean) => {
        globalThis.matchMedia = vi.fn().mockImplementation((query: string) => ({
            matches,
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));
    };

    test('previews the hovered colour on desktop viewports', async () => {
        mockDesktop(true);
        const user = userEvent.setup();
        renderTile();

        const swatchRegion = await screen.findByRole('group', { name: /available colou?rs/i });
        const navy = within(swatchRegion).getByRole('link', { name: /Navy/ });
        expect(navy).not.toHaveAttribute('aria-current');

        await user.hover(navy);

        // Hover selects the colour on desktop, marking the swatch as current.
        expect(within(swatchRegion).getByRole('link', { name: /Navy/ })).toHaveAttribute('aria-current', 'true');
    });

    test('does not preview on hover on mobile viewports', async () => {
        mockDesktop(false);
        const user = userEvent.setup();
        renderTile();

        const swatchRegion = await screen.findByRole('group', { name: /available colou?rs/i });
        const navy = within(swatchRegion).getByRole('link', { name: /Navy/ });

        await user.hover(navy);

        // Below the desktop breakpoint, hover is inert — the preview only changes on click/navigation.
        expect(within(swatchRegion).getByRole('link', { name: /Navy/ })).not.toHaveAttribute('aria-current');
    });
});

describe('ProductTile — quick-add pre-selection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('opens the quick-add modal pre-seeded with every axis from the represented variant', async () => {
        const user = userEvent.setup();
        renderTile({ product: mockMasterProduct });

        await user.click(screen.getByRole('button', { name: /quick add/i }));

        const dialog = await screen.findByRole('dialog');
        // Represented variant is { color: 'CHARCWL', size: '036', width: 'S' },
        // which maps to display names "Charcoal", "36", "Short".
        expect(await getDialogVariationRadio(dialog, user, 'Color', /Charcoal/)).toBeChecked();
        expect(await getDialogVariationRadio(dialog, user, 'Size', /^(?:Size )?36(?:, available)?$/i)).toBeChecked();
        expect(await getDialogVariationRadio(dialog, user, 'Width', /Short/)).toBeChecked();
    });

    test('marks the represented variant swatches as selected inside the modal', async () => {
        const user = userEvent.setup();
        renderTile({ product: mockMasterProduct });

        await user.click(screen.getByRole('button', { name: /quick add/i }));

        const dialog = await screen.findByRole('dialog');
        expect(await getDialogVariationRadio(dialog, user, 'Color', /Charcoal/)).toBeChecked();
        expect(await getDialogVariationRadio(dialog, user, 'Size', /^(?:Size )?36(?:, available)?$/i)).toBeChecked();
        expect(await getDialogVariationRadio(dialog, user, 'Width', /Short/)).toBeChecked();
    });
});

describe('ProductTile — no-product empty state', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIsDesignMode = false;
    });

    afterEach(() => {
        mockIsDesignMode = false;
    });

    test('renders nothing on the live storefront when no product is supplied', () => {
        const { container } = renderTile({ product: undefined });
        // The tile must not leak any placeholder to shoppers — no card, no "Select a product" text.
        expect(container.querySelector('.product-card')).toBeNull();
        expect(screen.queryByText(/select a product/i)).not.toBeInTheDocument();
    });

    test('renders a placeholder tile with the default title, rating, and price in Page Designer design mode', () => {
        mockIsDesignMode = true;
        renderTile({ product: undefined });
        // A real-shaped placeholder tile (image surface + "Product" heading + star rating + zero
        // price) stands in for the unconfigured tile so the authoring preview reads as a
        // fully-populated tile rather than a bare title.
        expect(screen.getByRole('heading', { name: 'Product' })).toBeInTheDocument();
        // Star rating placeholder: the StarRating group is announced with an empty (0-of-5) rating.
        expect(screen.getByRole('group', { name: /0 out of 5/i })).toBeInTheDocument();
        // Price placeholder: the zero price is currency-formatted (USD in the test wrapper), never a
        // hardcoded "$0.00" literal.
        expect(screen.getByText('$0.00')).toBeInTheDocument();
        expect(screen.queryByText(/select a product/i)).not.toBeInTheDocument();
    });

    test('omits the placeholder price (no Intl crash) when neither the site nor config resolves a currency', () => {
        mockIsDesignMode = true;
        // An authoring preview not yet wired to a site: no site currency and no configured site to
        // fall back to. An empty-string currency would reach `Intl.NumberFormat` and throw
        // `RangeError: Invalid currency code`, crashing the preview — the placeholder must instead
        // render without a price row. The title and rating still render.
        const configWithoutCurrency: AppConfig = {
            ...mockConfig,
            commerce: { ...mockConfig.commerce, sites: [] },
        };
        renderTile({ product: undefined }, { config: configWithoutCurrency, currency: '' });
        expect(screen.getByRole('heading', { name: 'Product' })).toBeInTheDocument();
        expect(screen.getByRole('group', { name: /0 out of 5/i })).toBeInTheDocument();
        expect(screen.queryByText(/\$?0\.00/)).not.toBeInTheDocument();
    });
});
