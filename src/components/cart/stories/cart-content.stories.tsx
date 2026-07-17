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
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import type { ReactElement, ReactNode } from 'react';
import type { ShopperBasketsV2, ShopperProducts } from '@/scapi';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

import { Info, Truck, Heart, Check, MapPin } from 'lucide-react';

import CartContent from '../cart-content';
import ProductItemsList from '@/components/product-items-list';
import OrderSummary from '@/components/order-summary';
import { CartInventoryErrorBanner } from '../cart-inventory-error-banner';
import { RemoveItemButtonWithConfirmation } from '@/components/buttons/remove-item-button-with-confirmation';
import { CartItemEditButton } from '@/components/cart/cart-item-edit-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Breadcrumb,
    BreadcrumbList,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbSeparator,
    BreadcrumbPage,
} from '@/components/ui/breadcrumb';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { isStandardProduct, isBonusProduct, type EnrichedProductItem } from '@/lib/product/product-utils';
import { basketWithBonusOpportunityAllSlotsFilled, basketWithGift, basketWithPromoError } from '@/components/__mocks__';
import { basketWithOneItem } from '@/components/__mocks__/basket-with-dress';
import { mockStandardProductOrderable } from '@/components/__mocks__/standard-product';

const meta: Meta<typeof CartContent> = {
    title: 'Cart/Cart Content',
    component: CartContent,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component: `
\`<CartContent>\` orchestrates the cart route — items list, order summary, bonus carousels, BOPIS pickup grouping, and the inventory-error CTA gate. The empty state delegates to \`<CartEmpty>\`.

Rather than mounting \`<CartContent>\` directly (it pulls in \`useBasketUpdater\` / \`useCartInventoryValidation\` / \`usePickup\` hooks that need a route loader to drive), most stories render an inline composition that mirrors the production layout — \`ProductItemsList\` + \`OrderSummary\` + a \`<Breadcrumb>\` shell + the same secondary/delivery action render-props the component uses internally. This lets us cover layout regressions without a route harness while still loading real fixtures.

## Stories

| Story | Description |
|-------|-------------|
| **CartWithItems** | Single item with order summary |
| **CartWithPromotions** | 2 items with line-level promotions and full action row |
| **MobileLayout** | Mobile viewport showcase — gift, bonus, and pickup card composed inline; \`showInventoryError\` control toggles the error banner |
| **WithBonusProducts** | Bonus opportunity with all slots filled — bonus line items rendered with disabled quantity picker |
| **WithGiftLine** | Line item flagged as gift — gift checkbox pre-checked |
| **WithErrorBanner** | Cart-wide inventory error banner above the checkout CTA |
| **CartWithPickupDelivery** | Mixed BOPIS + delivery cards |
                `,
            },
        },
    },
    // No meta-level argTypes — every story below uses a custom `render` that
    // ignores `args`, so exposing `basket` / `productsByItemId` / `promotions`
    // as controls produced no canvas effect (Pattern 5). Story-local controls
    // (e.g. MobileLayout's `showInventoryError`) live on the individual stories.
};

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Shared render helpers (extracted from per-story duplication)
// ---------------------------------------------------------------------------

const cartSecondaryActions = (product: EnrichedProductItem) => {
    if (!product.itemId) return undefined;
    const isBonusProd = isBonusProduct(product);
    const isStandardProd = isStandardProduct(product as ShopperProducts.schemas['Product']);
    const shouldShowEditButton = !isStandardProd && !isBonusProd;
    return (
        <div className="flex flex-col md:flex-row md:flex-wrap md:items-center gap-2 md:gap-3">
            <div className="flex items-center gap-3 flex-nowrap">
                {shouldShowEditButton && <CartItemEditButton product={product} className="px-0" />}
                <RemoveItemButtonWithConfirmation itemId={product.itemId} className="px-0" />
                <button
                    type="button"
                    className="text-sm text-primary hover:underline flex items-center gap-1 whitespace-nowrap">
                    <Heart className="size-3.5" />
                    Add to Wishlist
                </button>
            </div>
        </div>
    );
};

function CartLineItemGift(product: EnrichedProductItem): ReactElement | undefined {
    if (!product.itemId || isBonusProduct(product)) {
        return undefined;
    }
    const { t } = getTranslation();
    const fieldId = `cart-gift-${product.itemId}`;
    const defaultChecked = (product as { gift?: boolean }).gift === true;
    return (
        <div className="flex flex-wrap items-center justify-start gap-x-2 gap-y-1 md:justify-end">
            <Checkbox id={fieldId} defaultChecked={defaultChecked} />
            <div className="flex flex-wrap items-center gap-1">
                <Label htmlFor={fieldId} className="text-sm text-muted-foreground cursor-pointer font-normal">
                    {t('cart:lineItem.giftLabel')}
                </Label>
                <Button
                    type="button"
                    variant="ghost"
                    className="text-sm text-muted-foreground font-normal shrink-0 p-0 h-auto shadow-none">
                    {t('cart:lineItem.giftLearnMore')}
                </Button>
            </div>
        </div>
    );
}

const cartPickupActions = (_product: EnrichedProductItem) => (
    <DropdownMenu>
        <DropdownMenuTrigger asChild>
            <button type="button" className="cursor-pointer">
                <Badge variant="secondary" className="text-xs font-medium gap-1 text-primary bg-primary/10">
                    <MapPin className="size-3" />
                    Pickup
                </Badge>
            </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 p-0">
            <DropdownMenuItem className="py-2.5 px-3 text-sm text-primary font-medium bg-primary/5 cursor-pointer">
                <Check className="size-4 text-primary" />
                Pick Up in Store
            </DropdownMenuItem>
            <DropdownMenuSeparator className="my-0" />
            <DropdownMenuItem className="py-2.5 px-3 text-sm text-foreground cursor-pointer">
                <span className="w-4" />
                Ship to Address
            </DropdownMenuItem>
        </DropdownMenuContent>
    </DropdownMenu>
);

const cartDeliveryActions = (_product: EnrichedProductItem) => (
    <DropdownMenu>
        <DropdownMenuTrigger asChild>
            <button type="button" className="cursor-pointer">
                <Badge variant="secondary" className="text-xs font-medium gap-1">
                    <Truck className="size-3" />
                    Delivery
                </Badge>
            </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 p-0">
            <DropdownMenuItem className="py-2.5 px-3 text-sm text-foreground cursor-pointer">
                <span className="w-4" />
                Pick Up in Store
            </DropdownMenuItem>
            <DropdownMenuSeparator className="my-0" />
            <DropdownMenuItem className="py-2.5 px-3 text-sm text-primary font-medium bg-primary/5 cursor-pointer">
                <Check className="size-4 text-primary" />
                Ship to Address
            </DropdownMenuItem>
        </DropdownMenuContent>
    </DropdownMenu>
);

function CartShell({
    basket,
    productsByItemId,
    items,
    leadingBanner,
}: {
    basket: ShopperBasketsV2.schemas['Basket'];
    productsByItemId: Record<string, ShopperProducts.schemas['Product']>;
    items: ShopperBasketsV2.schemas['ProductItem'][];
    leadingBanner?: ReactNode;
}): ReactElement {
    return (
        <div className="flex-1 min-h-screen bg-background mb-10" data-testid="sf-cart-container">
            <div className="section-container">
                <Breadcrumb className="mb-6 mt-4">
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <BreadcrumbLink href="/">Home</BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbPage>Cart</BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
                {leadingBanner}
                <div className="grid grid-cols-1 lg:grid-cols-[66%_1fr] lg:gap-11">
                    <div className="md:order-2 lg:order-1">
                        <div className="md:p-8 p-3 border border-border rounded-none mb-3">
                            <div className="flex items-start gap-2 mb-4">
                                <Info className="size-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                                <div>
                                    <div className="text-sm font-semibold">
                                        Delivery - {items.length} out of {items.length}{' '}
                                        {items.length === 1 ? 'item' : 'items'}
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                        478 Artisan Way, Somerville, MA 02145
                                    </div>
                                </div>
                            </div>
                            <ProductItemsList
                                productItems={items}
                                productsByItemId={productsByItemId}
                                secondaryActions={cartSecondaryActions}
                                deliveryActions={cartDeliveryActions}
                                lineItemExtra={CartLineItemGift}
                            />
                        </div>
                    </div>
                    <div className="hidden md:block md:order-1 lg:order-2">
                        <OrderSummary
                            basket={basket}
                            showCartItems={false}
                            isEstimate={true}
                            productsByItemId={productsByItemId}
                            showPromoCodeForm={true}
                            showCheckoutAction={true}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

const makeBasket = (overrides: Partial<ShopperBasketsV2.schemas['Basket']>): ShopperBasketsV2.schemas['Basket'] => ({
    ...basketWithOneItem,
    ...overrides,
});

const cartWithItemsBasketItems = [
    {
        itemId: 'item-1',
        productId: mockStandardProductOrderable.product.id,
        quantity: 1,
        price: 42,
        productName: mockStandardProductOrderable.product.name,
        priceAfterItemDiscount: 42,
    },
] as ShopperBasketsV2.schemas['ProductItem'][];

const cartWithItemsProductMap: Record<string, ShopperProducts.schemas['Product']> = {
    'item-1': mockStandardProductOrderable.product,
};

const cartWithItemsBasket = makeBasket({
    productItems: cartWithItemsBasketItems,
    productSubTotal: 42,
    productTotal: 42,
    shippingTotal: 5.99,
    taxTotal: 3.36,
    orderTotal: 51.35,
});

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

// Empty-cart state is covered by `cart-empty.stories.tsx` directly — no need
// for a redundant story here that mounts `<CartContent basket={emptyBasket}>`
// just to delegate to the same `<CartEmpty>` component.

export const CartWithItems: Story = {
    args: {
        basket: cartWithItemsBasket,
        productsByItemId: cartWithItemsProductMap,
    },
    parameters: {
        docs: {
            description: {
                story: 'Single item — composed `ProductItemsList` + `OrderSummary` matching the production layout.',
            },
        },
    },
    render: () => (
        <CartShell
            basket={cartWithItemsBasket}
            productsByItemId={cartWithItemsProductMap}
            items={cartWithItemsBasketItems}
        />
    ),
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const cartContainer = canvasElement.querySelector('[data-testid="sf-cart-container"]');
        await expect(cartContainer).toBeInTheDocument();

        const emptyCart = canvasElement.querySelector('[data-testid="sf-cart-empty"]');
        await expect(emptyCart).not.toBeInTheDocument();

        // Assert on the breadcrumb's active-page indicator specifically — the
        // previous `/cart/i` regex matched any text containing "cart" (close
        // button label, empty-cart container, etc.), making the assertion
        // permissive (Pattern 6).
        const cartCrumb = await canvas.findByText('Cart', { selector: '[aria-current="page"]' });
        await expect(cartCrumb).toBeInTheDocument();

        const productItems = canvasElement.querySelectorAll('[data-testid^="sf-product-item-"]');
        await expect(productItems.length).toBeGreaterThanOrEqual(1);
    },
};

const cartWithPromotionsBasketItems = [
    {
        itemId: 'promo-item-1',
        productId: mockStandardProductOrderable.product.id,
        quantity: 1,
        price: 45,
        productName: mockStandardProductOrderable.product.name,
        priceAfterItemDiscount: 40,
        priceAdjustments: [
            {
                priceAdjustmentId: 'promo-item-1-adj',
                itemText: '$5 Off Tops',
                price: -5,
                promotionId: 'promo-tops-5-off',
            },
        ],
    },
    {
        itemId: 'promo-item-2',
        productId: mockStandardProductOrderable.product.id,
        quantity: 1,
        price: 30,
        productName: mockStandardProductOrderable.product.name,
        priceAfterItemDiscount: 27,
        priceAdjustments: [
            {
                priceAdjustmentId: 'promo-item-2-adj',
                itemText: '10% Off Accessories',
                price: -3,
                promotionId: 'promo-accessories-10-off',
            },
        ],
    },
] as ShopperBasketsV2.schemas['ProductItem'][];

const cartWithPromotionsProductMap: Record<string, ShopperProducts.schemas['Product']> = {
    'promo-item-1': mockStandardProductOrderable.product,
    'promo-item-2': mockStandardProductOrderable.product,
};

const cartWithPromotionsBasket = makeBasket({
    productItems: cartWithPromotionsBasketItems,
    productSubTotal: 75,
    productTotal: 67,
    shippingTotal: 0,
    taxTotal: 5.36,
    orderTotal: 72.36,
});

export const CartWithPromotions: Story = {
    args: {
        basket: cartWithPromotionsBasket,
        productsByItemId: cartWithPromotionsProductMap,
    },
    parameters: {
        docs: {
            description: {
                story: '2 items each carrying a line-level `priceAdjustment` (`$5 Off Tops`, `10% Off Accessories`). Verifies the promo callout renders on each line and the order summary shows the discounted total.',
            },
        },
    },
    render: () => (
        <CartShell
            basket={cartWithPromotionsBasket}
            productsByItemId={cartWithPromotionsProductMap}
            items={cartWithPromotionsBasketItems}
        />
    ),
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const cartContainer = canvasElement.querySelector('[data-testid="sf-cart-container"]');
        await expect(cartContainer).toBeInTheDocument();

        // Assert on the breadcrumb's active-page indicator specifically — the
        // previous `/cart/i` regex matched any text containing "cart" (close
        // button label, empty-cart container, etc.), making the assertion
        // permissive (Pattern 6).
        const cartCrumb = await canvas.findByText('Cart', { selector: '[aria-current="page"]' });
        await expect(cartCrumb).toBeInTheDocument();

        const productItems = canvasElement.querySelectorAll('[data-testid^="sf-product-item-"]');
        await expect(productItems.length).toBeGreaterThanOrEqual(2);

        // Both line-level promotion callouts should render.
        await expect(canvas.findByText('$5 Off Tops')).resolves.toBeInTheDocument();
        await expect(canvas.findByText('10% Off Accessories')).resolves.toBeInTheDocument();
    },
};

// Mobile showcase fixture — combines a delivery item, a gift-flagged item, a
// bonus product, and a pickup item so the mobile layout exercises every
// feature row simultaneously (gift checkbox pre-checked, bonus line free,
// pickup card with "Change Store", inventory error banner above the CTA).
const mobileShowcaseItems = [
    {
        itemId: 'mobile-delivery-1',
        productId: mockStandardProductOrderable.product.id,
        quantity: 1,
        price: 42,
        productName: mockStandardProductOrderable.product.name,
        priceAfterItemDiscount: 42,
        gift: false,
    },
    {
        itemId: 'mobile-gift-1',
        productId: mockStandardProductOrderable.product.id,
        quantity: 2,
        price: 38,
        productName: mockStandardProductOrderable.product.name,
        priceAfterItemDiscount: 76,
        gift: true,
    },
    {
        itemId: 'mobile-bonus-1',
        productId: 'bonus-tie-mobile',
        productName: 'Free Silk Tie (Bonus)',
        bonusProductLineItem: true,
        bonusDiscountLineItemId: 'bdli-mobile',
        quantity: 1,
        price: 0,
        priceAfterItemDiscount: 0,
    },
    {
        itemId: 'mobile-pickup-1',
        productId: mockStandardProductOrderable.product.id,
        quantity: 1,
        price: 30,
        productName: mockStandardProductOrderable.product.name,
        priceAfterItemDiscount: 30,
        gift: false,
    },
] as ShopperBasketsV2.schemas['ProductItem'][];

const mobileShowcaseProductMap: Record<string, ShopperProducts.schemas['Product']> = {
    'mobile-delivery-1': mockStandardProductOrderable.product,
    'mobile-gift-1': mockStandardProductOrderable.product,
    'mobile-bonus-1': {
        ...mockStandardProductOrderable.product,
        id: 'bonus-tie-mobile',
        name: 'Free Silk Tie (Bonus)',
    },
    'mobile-pickup-1': mockStandardProductOrderable.product,
};

const mobileShowcaseDeliveryItems = mobileShowcaseItems.slice(0, 3);
const mobileShowcasePickupItems = mobileShowcaseItems.slice(3);

const mobileShowcaseBasket = makeBasket({
    productItems: mobileShowcaseItems,
    bonusDiscountLineItems: [
        {
            id: 'bdli-mobile',
            promotionId: 'promo-mobile-bonus-tie',
            maxBonusItems: 1,
            bonusProducts: [{ productId: 'bonus-tie-mobile', productName: 'Free Silk Tie (Bonus)' }],
        },
    ],
    productSubTotal: 148,
    productTotal: 148,
    shippingTotal: 0,
    taxTotal: 11.84,
    orderTotal: 159.84,
});

// MobileShowcase is its own component so the story can carry a story-local
// `showInventoryError` control without polluting the meta's typed args.
function MobileShowcase({ showInventoryError = false }: { showInventoryError?: boolean }): ReactElement {
    return (
        <div className="flex-1 min-h-screen bg-background mb-10" data-testid="sf-cart-container">
            <div className="section-container">
                <Breadcrumb className="mb-6 mt-4">
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <BreadcrumbLink href="/">Home</BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbPage>Cart</BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
                {showInventoryError && (
                    <CartInventoryErrorBanner
                        issues={[
                            {
                                itemId: 'mobile-pickup-1',
                                productId: mockStandardProductOrderable.product.id ?? 'product',
                                productName: mockStandardProductOrderable.product.name ?? 'Product',
                                requestedQuantity: 1,
                                availableStock: 0,
                                isPickup: true,
                            },
                        ]}
                        id="mobile-cart-inventory-error"
                        className="mb-4"
                    />
                )}
                <div className="space-y-3">
                    <OrderSummary
                        basket={mobileShowcaseBasket}
                        showCartItems={false}
                        isEstimate={true}
                        productsByItemId={mobileShowcaseProductMap}
                        showPromoCodeForm={true}
                        showCheckoutAction={true}
                    />
                    <div className="p-3 border border-border rounded-none">
                        <div className="flex items-start justify-between gap-2 mb-4">
                            <div className="flex items-start gap-2">
                                <MapPin className="size-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                                <div>
                                    <div className="text-sm font-semibold">
                                        Pickup in <span className="font-bold">Dorchester</span> -{' '}
                                        {mobileShowcasePickupItems.length} out of {mobileShowcaseItems.length} items
                                        available
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                        26 District Avenue, Dorchester, MA 02125
                                    </div>
                                </div>
                            </div>
                            <Button variant="outline" size="sm" className="whitespace-nowrap flex-shrink-0">
                                Change Store
                            </Button>
                        </div>
                        <ProductItemsList
                            productItems={mobileShowcasePickupItems}
                            productsByItemId={mobileShowcaseProductMap}
                            secondaryActions={cartSecondaryActions}
                            deliveryActions={cartPickupActions}
                            lineItemExtra={CartLineItemGift}
                        />
                    </div>
                    <div className="p-3 border border-border rounded-none">
                        <div className="flex items-start gap-2 mb-4">
                            <Info className="size-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                            <div>
                                <div className="text-sm font-semibold">
                                    Delivery - {mobileShowcaseDeliveryItems.length} out of {mobileShowcaseItems.length}{' '}
                                    items
                                </div>
                                <div className="text-sm text-muted-foreground">
                                    478 Artisan Way, Somerville, MA 02145
                                </div>
                            </div>
                        </div>
                        <ProductItemsList
                            productItems={mobileShowcaseDeliveryItems}
                            productsByItemId={mobileShowcaseProductMap}
                            secondaryActions={cartSecondaryActions}
                            deliveryActions={cartDeliveryActions}
                            lineItemExtra={CartLineItemGift}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

export const MobileLayout: StoryObj<typeof MobileShowcase> = {
    args: {
        showInventoryError: false,
    },
    argTypes: {
        showInventoryError: {
            control: 'boolean',
            description:
                'Toggle the cart-wide inventory error banner above the order summary. Off by default; flip on via the controls panel to review the error layout in mobile.',
        },
    },
    parameters: {
        docs: {
            description: {
                story: 'Mobile viewport showcase — composed inline with the full cart feature set on screen at once: delivery items (one flagged as a gift, gift checkbox pre-checked), a bonus line item at price 0 with disabled quantity picker, and a separate pickup card with "Change Store". The inventory error banner is hidden by default; flip the `showInventoryError` control to render it above the order summary. Use this story when reviewing whether the mobile stack still holds together as features are added.',
            },
        },
    },
    globals: {
        viewport: 'mobile2',
    },
    render: (args) => <MobileShowcase {...args} />,
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const { t } = getTranslation();

        const cartContainer = canvasElement.querySelector('[data-testid="sf-cart-container"]');
        await expect(cartContainer).toBeInTheDocument();

        const breadcrumb = canvasElement.querySelector('[aria-label="breadcrumb"]');
        await expect(breadcrumb).toBeInTheDocument();

        // Pickup card affordance.
        await expect(canvas.findByRole('button', { name: /change store/i })).resolves.toBeInTheDocument();

        // Gift checkbox surfaces for non-bonus delivery lines (one is pre-checked).
        const giftCheckboxes = await canvas.findAllByLabelText(t('cart:lineItem.giftLabel'));
        await expect(giftCheckboxes.length).toBeGreaterThanOrEqual(2);
        const checked = giftCheckboxes.filter(
            (c) => (c as HTMLInputElement).checked || c.getAttribute('aria-checked') === 'true'
        );
        await expect(checked.length).toBeGreaterThanOrEqual(1);

        // Bonus line renders without a gift checkbox (CartLineItemGift returns
        // undefined for bonus items) — confirms bonus rows are styled differently.
        const allItems = canvasElement.querySelectorAll('[data-testid^="sf-product-item-"]');
        await expect(allItems.length).toBeGreaterThanOrEqual(4);

        // With the default `showInventoryError: false`, the alert banner must
        // not appear. (`WithErrorBanner` covers the visible state.)
        await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
    },
};

const bonusBasket = basketWithBonusOpportunityAllSlotsFilled;
const bonusItems = bonusBasket.productItems ?? [];
const bonusProductMap: Record<string, ShopperProducts.schemas['Product']> = bonusItems.reduce(
    (acc, item) => {
        if (item.itemId) {
            acc[item.itemId] = {
                ...mockStandardProductOrderable.product,
                id: item.productId ?? mockStandardProductOrderable.product.id,
                name: item.productName ?? mockStandardProductOrderable.product.name,
            };
        }
        return acc;
    },
    {} as Record<string, ShopperProducts.schemas['Product']>
);

export const WithBonusProducts: Story = {
    args: {
        basket: bonusBasket,
        productsByItemId: bonusProductMap,
    },
    parameters: {
        docs: {
            description: {
                story: 'Cart with a bonus opportunity and all slots filled — bonus line items render alongside the qualifying product. Uses `basketWithBonusOpportunityAllSlotsFilled` from `__mocks__`.',
            },
        },
    },
    render: () => <CartShell basket={bonusBasket} productsByItemId={bonusProductMap} items={bonusItems} />,
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const cartContainer = canvasElement.querySelector('[data-testid="sf-cart-container"]');
        await expect(cartContainer).toBeInTheDocument();

        // Assert on the breadcrumb's active-page indicator specifically — the
        // previous `/cart/i` regex matched any text containing "cart" (close
        // button label, empty-cart container, etc.), making the assertion
        // permissive (Pattern 6).
        const cartCrumb = await canvas.findByText('Cart', { selector: '[aria-current="page"]' });
        await expect(cartCrumb).toBeInTheDocument();

        const productItems = canvasElement.querySelectorAll('[data-testid^="sf-product-item-"]');
        await expect(productItems.length).toBeGreaterThanOrEqual(2);
    },
};

const giftItems = basketWithGift.productItems ?? [];
const giftProductMap: Record<string, ShopperProducts.schemas['Product']> = giftItems.reduce(
    (acc, item) => {
        if (item.itemId) {
            acc[item.itemId] = {
                ...mockStandardProductOrderable.product,
                id: item.productId ?? mockStandardProductOrderable.product.id,
                name: item.productName ?? mockStandardProductOrderable.product.name,
            };
        }
        return acc;
    },
    {} as Record<string, ShopperProducts.schemas['Product']>
);

export const WithGiftLine: Story = {
    args: {
        basket: basketWithGift,
        productsByItemId: giftProductMap,
    },
    parameters: {
        docs: {
            description: {
                story: 'Line item flagged as a gift. The `CartLineItemGift` render-prop reads `productItem.gift` and renders the gift checkbox pre-checked. Backed by the new `basketWithGift` fixture.',
            },
        },
    },
    render: () => <CartShell basket={basketWithGift} productsByItemId={giftProductMap} items={giftItems} />,
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const { t } = getTranslation();

        const giftCheckbox = await canvas.findByLabelText(t('cart:lineItem.giftLabel'));
        await expect(giftCheckbox).toBeChecked();
    },
};

const promoErrorItems = basketWithPromoError.productItems ?? [];
const promoErrorProductMap: Record<string, ShopperProducts.schemas['Product']> = promoErrorItems.reduce(
    (acc, item) => {
        if (item.itemId) {
            acc[item.itemId] = {
                ...mockStandardProductOrderable.product,
                id: item.productId ?? mockStandardProductOrderable.product.id,
                name: item.productName ?? mockStandardProductOrderable.product.name,
            };
        }
        return acc;
    },
    {} as Record<string, ShopperProducts.schemas['Product']>
);

export const WithErrorBanner: Story = {
    args: {
        basket: basketWithPromoError,
        productsByItemId: promoErrorProductMap,
    },
    parameters: {
        docs: {
            description: {
                story: 'Cart-wide inventory error banner above the order summary. Production renders this above the checkout CTA when `useCartInventoryValidation` flags items exceeding stock; the story asserts the banner shape using the `<CartInventoryErrorBanner>` directly. Promo-error fixture also includes an applied + invalid coupon to exercise the order-summary discount line.',
            },
        },
    },
    render: () => (
        <CartShell
            basket={basketWithPromoError}
            productsByItemId={promoErrorProductMap}
            items={promoErrorItems}
            leadingBanner={
                <div className="mb-4">
                    <CartInventoryErrorBanner
                        issues={[
                            {
                                itemId: 'promo-error-line-1',
                                productId: '029407331227M',
                                productName: 'Solid Silk Tie',
                                requestedQuantity: 2,
                                availableStock: 1,
                                isPickup: false,
                            },
                        ]}
                        id="cart-inventory-error-story"
                    />
                </div>
            }
        />
    ),
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const banner = await canvas.findByRole('alert');
        await expect(banner).toBeInTheDocument();
    },
};

const pickupDeliveryBasketItems = [
    {
        itemId: 'pd-item-1',
        productId: mockStandardProductOrderable.product.id,
        quantity: 1,
        price: 35,
        productName: mockStandardProductOrderable.product.name,
        priceAfterItemDiscount: 35,
    },
    {
        itemId: 'pd-item-2',
        productId: mockStandardProductOrderable.product.id,
        quantity: 1,
        price: 45,
        productName: mockStandardProductOrderable.product.name,
        priceAfterItemDiscount: 45,
    },
    {
        itemId: 'pd-item-3',
        productId: mockStandardProductOrderable.product.id,
        quantity: 2,
        price: 30,
        productName: mockStandardProductOrderable.product.name,
        priceAfterItemDiscount: 60,
    },
] as ShopperBasketsV2.schemas['ProductItem'][];

const pickupDeliveryProductMap: Record<string, ShopperProducts.schemas['Product']> = {
    'pd-item-1': mockStandardProductOrderable.product,
    'pd-item-2': mockStandardProductOrderable.product,
    'pd-item-3': mockStandardProductOrderable.product,
};

const pickupDeliveryBasket = makeBasket({
    productItems: pickupDeliveryBasketItems,
    productSubTotal: 140,
    productTotal: 140,
    shippingTotal: 0,
    taxTotal: 11.2,
    orderTotal: 151.2,
});

const pickupItems = [pickupDeliveryBasketItems[0]] as ShopperBasketsV2.schemas['ProductItem'][];
const deliveryItems = pickupDeliveryBasketItems.slice(1);

export const CartWithPickupDelivery: Story = {
    args: {
        basket: pickupDeliveryBasket,
        productsByItemId: pickupDeliveryProductMap,
    },
    parameters: {
        docs: {
            description: {
                story: 'Mixed BOPIS + delivery — 1 pickup item with store info card, 2 delivery items with shipping info card. Each line item exposes the fulfillment dropdown.',
            },
        },
    },
    render: () => (
        <div className="flex-1 min-h-screen bg-background mb-10" data-testid="sf-cart-container">
            <div className="section-container">
                <Breadcrumb className="mb-6 mt-4">
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <BreadcrumbLink href="/">Home</BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbPage>Cart</BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
                <div className="grid grid-cols-1 lg:grid-cols-[66%_1fr] lg:gap-11">
                    <div className="md:order-2 lg:order-1 space-y-3">
                        <div className="md:p-8 p-3 border border-border rounded-none">
                            <div className="flex items-start justify-between gap-2 mb-4">
                                <div className="flex items-start gap-2">
                                    <MapPin className="size-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                                    <div>
                                        <div className="text-sm font-semibold">
                                            Pickup in <span className="font-bold">Dorchester</span> -{' '}
                                            {pickupItems.length} out of {pickupDeliveryBasketItems.length}{' '}
                                            {pickupDeliveryBasketItems.length === 1 ? 'item' : 'items'} available
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            26 District Avenue, Dorchester, MA 02125
                                        </div>
                                    </div>
                                </div>
                                <Button variant="outline" size="sm" className="whitespace-nowrap flex-shrink-0">
                                    Change Store
                                </Button>
                            </div>
                            <ProductItemsList
                                productItems={pickupItems}
                                productsByItemId={pickupDeliveryProductMap}
                                secondaryActions={cartSecondaryActions}
                                deliveryActions={cartPickupActions}
                                lineItemExtra={CartLineItemGift}
                            />
                        </div>
                        <div className="md:p-8 p-3 border border-border rounded-none">
                            <div className="flex items-start gap-2 mb-4">
                                <Info className="size-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                                <div>
                                    <div className="text-sm font-semibold">
                                        Delivery - {deliveryItems.length} out of {pickupDeliveryBasketItems.length}{' '}
                                        {pickupDeliveryBasketItems.length === 1 ? 'item' : 'items'}
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                        478 Artisan Way, Somerville, MA 02145
                                    </div>
                                </div>
                            </div>
                            <ProductItemsList
                                productItems={deliveryItems}
                                productsByItemId={pickupDeliveryProductMap}
                                secondaryActions={cartSecondaryActions}
                                deliveryActions={cartDeliveryActions}
                                lineItemExtra={CartLineItemGift}
                            />
                        </div>
                    </div>
                    <div className="hidden md:block md:order-1 lg:order-2">
                        <OrderSummary
                            basket={pickupDeliveryBasket}
                            showCartItems={false}
                            isEstimate={true}
                            productsByItemId={pickupDeliveryProductMap}
                            showPromoCodeForm={true}
                            showCheckoutAction={true}
                        />
                    </div>
                </div>
            </div>
        </div>
    ),
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const cartContainer = canvasElement.querySelector('[data-testid="sf-cart-container"]');
        await expect(cartContainer).toBeInTheDocument();

        // Assert on the breadcrumb's active-page indicator specifically — the
        // previous `/cart/i` regex matched any text containing "cart" (close
        // button label, empty-cart container, etc.), making the assertion
        // permissive (Pattern 6).
        const cartCrumb = await canvas.findByText('Cart', { selector: '[aria-current="page"]' });
        await expect(cartCrumb).toBeInTheDocument();

        const productItems = canvasElement.querySelectorAll('[data-testid^="sf-product-item-"]');
        await expect(productItems.length).toBeGreaterThanOrEqual(3);
    },
};
