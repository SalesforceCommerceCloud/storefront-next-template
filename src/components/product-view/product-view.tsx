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
import { type ReactElement } from 'react';
import { Gift, Mail, Package, ShoppingBag, Sparkles } from 'lucide-react';
import type { ShopperProducts } from '@/scapi';
import { Link } from '@/components/link';
import ImageGallery from '@/components/image-gallery';
import ProductInfo from '@/components/product-view/product-info';
import ProductCartActions from '@/components/product-cart-actions';
import { ProductDeliveryInfo } from '@/components/delivery-promise/product-delivery-info';
import ProductViewProvider, { useOptionalProductView } from '@/providers/product-view';
import { useProductImages } from '@/hooks/product/use-product-images';
import { useSelectedVariations } from '@/hooks/product/use-selected-variations';
import { isProductSet, isProductBundle } from '@/lib/product/product-utils';
import { uiConfig } from '@/lib/config.ui';
import CollapsibleHtmlSection from '@/components/collapsible-section/collapsible-html-section';
import { useTranslation } from 'react-i18next';
import { UITarget } from '@/targets/ui-target';

interface ProductViewProps {
    product: ShopperProducts.schemas['Product'];
    mode?: 'add' | 'edit';
    displayVariant?: 'default' | 'reference';
}

/**
 * ProductView component renders a complete product detail view with image gallery and product information.
 *
 * @param props - The component props
 * @param props.product - The product data from Salesforce Commerce Cloud containing all product details,
 *                        variants, pricing, and metadata
 *
 * @returns A React element containing the complete product view layout
 *
 * @example
 * ```tsx
 * <ProductView product={productData} />
 * ```
 */
export default function ProductView({ product, mode = 'add', displayVariant = 'default' }: ProductViewProps): ReactElement {
    const productView = useOptionalProductView();
    const isProductASet = isProductSet(product);
    const isProductABundle = isProductBundle(product);
    const selectedAttributes = useSelectedVariations({ product });
    const { galleryImages } = useProductImages({ product, selectedAttributes });
    const { t } = useTranslation('product');
    // Furniture opts into the mosaic PDP gallery via config; every other vertical stays stacked.
    const galleryLayout = uiConfig.pages.product.galleryLayout ?? 'stacked';

    const content = (
        <div className="space-y-10 lg:space-y-12">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-12">
                <div className="order-1">
                    <ImageGallery
                        key={product.id}
                        images={galleryImages}
                        eager={!isProductASet && !isProductABundle}
                        showNavigationArrows
                        navigationArrowSize="lg"
                        productName={product.name}
                        layout={galleryLayout}
                    />
                    {displayVariant !== 'reference' && <UITarget targetId="sfcc.pdp.agent.productHelper" />}
                    {displayVariant !== 'reference' &&
                        product.longDescription &&
                        product.longDescription !== product.shortDescription && (
                            <CollapsibleHtmlSection
                                label={`${t('description')}:`}
                                content={product.longDescription}
                                contentType="bulleted-list"
                                defaultOpen
                                className="mt-6"
                            />
                        )}
                </div>

                <div className="order-2">
                    <ProductInfo
                        product={product}
                        hideDeliveryOptions={displayVariant === 'reference'}
                        showQuantityPicker={displayVariant !== 'reference'}
                        sizeSelectorStyle={displayVariant === 'reference' ? 'dropdown' : undefined}
                        // @sfdc-extension-block-start SFDC_EXT_BOPIS
                        // @sfdc-extension-line SFDC_EXT_SHIPPING_DELIVERY
                        enableDeliveryEstimatePresentation
                        // @sfdc-extension-block-end SFDC_EXT_BOPIS
                    />
                    {displayVariant !== 'reference' && <ProductDeliveryInfo productId={product.id} />}
                    <ProductCartActions
                        product={product}
                        hideExpressPayments={displayVariant === 'reference'}
                        showWishlistButton={displayVariant === 'reference'}
                        hidePostActionContent={displayVariant === 'reference'}
                        addToCartLabel={displayVariant === 'reference' ? 'Add to Bag' : undefined}
                    />
                    {displayVariant !== 'reference' && (
                        <>
                            <UITarget targetId="sfcc.pdp.returnsWarranty" />
                            <UITarget targetId="sfcc.pdp.collapsibles" />
                        </>
                    )}
                </div>
            </div>

            {displayVariant === 'reference' && (
                <>
                    <section className="grid grid-cols-1 gap-10 border-t border-border pt-8 lg:grid-cols-2 lg:gap-12">
                        <div className="space-y-6">
                        <UITarget targetId="sfcc.pdp.agent.productHelper" />
                        <div>
                            <h2 className="mb-3 text-xl font-semibold text-foreground">Details &amp; care</h2>
                            <div className="space-y-5 text-sm leading-5 text-foreground">
                                <p>
                                    Premium Italian wool designed in a mélange of deep greens and blues distinguishes a
                                    sport coat that&apos;s tailored in a trim fit and fitted in the waist for a smartly
                                    refined silhouette. Styled with traditional notched lapels, it brings an elegant
                                    finish to any semiformal look.
                                </p>
                                <p>
                                    <strong>Fabrication:</strong> Wool is the most common of suiting fibers, with
                                    durable, flexible properties that help formalwear maintain its shape. Naturally
                                    breathable and water-resistant, wool retains heat when it&apos;s cold and vents heat
                                    when it&apos;s warm.
                                </p>
                                <p>
                                    <strong>Formality:</strong> Semiformal occasions that require you to look on the
                                    casual side of well-dressed, including daytime events, business-casual meetings,
                                    work travel and social functions
                                </p>
                                <ul className="list-disc space-y-1 pl-5">
                                    <li>Notched lapels</li>
                                    <li>
                                        Cuff buttons may not be attached. Jackets purchased at full price can have the
                                        sleeve length customized for free at your local Nordstrom
                                    </li>
                                    <li>Chest welt pocket; front patch pockets</li>
                                    <li>Side vents</li>
                                    <li>Partially lined</li>
                                    <li>100% wool</li>
                                    <li>Dry clean</li>
                                    <li>Made in Italy</li>
                                    <li>Item #10899121</li>
                                    <li>Core Product ID 333333XE25</li>
                                </ul>
                            </div>
                        </div>
                        </div>

                        <div className="space-y-8">
                        <section aria-labelledby="pdp-gift-options-title" className="space-y-4">
                            <h2 id="pdp-gift-options-title" className="flex items-center gap-2 text-lg font-semibold">
                                <Gift aria-hidden="true" className="size-5" />
                                Gift options
                            </h2>
                            <p className="text-sm leading-6 text-muted-foreground">
                                Choose your gift options at checkout. Some items may not be eligible for all gift
                                options.
                            </p>
                            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                                <div>
                                    <h3 className="mb-2 text-sm font-semibold">Free Pickup</h3>
                                    <ul className="space-y-2 text-sm text-muted-foreground">
                                        <li className="flex items-center gap-2">
                                            <Mail aria-hidden="true" className="size-4" />
                                            Printed gift message (free)
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <Package aria-hidden="true" className="size-4" />
                                            Nordstrom gift box (free)
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <ShoppingBag aria-hidden="true" className="size-4" />
                                            Fabric gift bag ($5)
                                        </li>
                                    </ul>
                                </div>
                                <div>
                                    <h3 className="mb-2 text-sm font-semibold">Delivery</h3>
                                    <ul className="space-y-2 text-sm text-muted-foreground">
                                        <li className="flex items-center gap-2">
                                            <Mail aria-hidden="true" className="size-4" />
                                            Email gift message (free)
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <Mail aria-hidden="true" className="size-4" />
                                            Printed gift message (free)
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <ShoppingBag aria-hidden="true" className="size-4" />
                                            Fabric gift bag ($5)
                                        </li>
                                    </ul>
                                </div>
                            </div>
                            <p className="text-sm font-semibold">
                                Need help finding the perfect gift? We’ve got you covered.
                            </p>
                            <Link
                                to="/search?q=gifts"
                                className="inline-flex h-10 min-w-48 items-center justify-center rounded-ui border border-foreground px-5 text-sm font-medium text-foreground hover:bg-muted">
                                <Sparkles aria-hidden="true" className="mr-2 size-4" />
                                Shop Gifts
                            </Link>
                        </section>

                        {product.brand && (
                            <section aria-labelledby="pdp-brand-story-title" className="space-y-3">
                                <h2
                                    id="pdp-brand-story-title"
                                    className="text-xl font-semibold text-foreground underline underline-offset-4">
                                    Canali
                                </h2>
                                <p className="text-sm leading-6 text-muted-foreground">
                                    Canali traces its origins back to 1930s Italy, a place and time associated with the
                                    dawn of modern suiting. Two generations later, the Canali family still crafts their
                                    clothing and accessories in Italy, with headquarters in Sovico. The brand is best
                                    known for its impeccable suits, sport coats and dress shirts and also offers more
                                    casual sportswear pieces.
                                </p>
                            </section>
                        )}
                        </div>
                    </section>

                    <section className="max-w-xl space-y-6 pt-8 text-sm leading-5 text-foreground">
                        <div className="space-y-4">
                            <h2 className="text-xl font-semibold">Size info</h2>
                            <div className="space-y-1">
                                <p>True to size.</p>
                                <p>Considered a Slim fit; fitted through the chest, armholes and sides.</p>
                                <p>
                                    Height recommendations: Short = 5&apos;4&quot;-5&apos;7&quot;, Regular =
                                    5&apos;8&quot;-6&apos;2&quot;, Long = 6&apos;2 1/2&quot;-6&apos;5&quot;.
                                </p>
                            </div>
                            <ul className="list-disc space-y-2 pl-5">
                                <li>
                                    Get the fit you want. Book an appointment with our onsite experts or stop by your
                                    nearest store.
                                </li>
                            </ul>
                            <p className="underline underline-offset-4">Learn more about alterations.</p>
                        </div>

                        <div className="space-y-4">
                            <h2 className="text-xl font-semibold">Shipping &amp; returns</h2>
                            <p>
                                Free shipping. Free returns. All the time. Purchases made online can also be returned or
                                exchanged at any Nordstrom store, free of charge. Read more about our{' '}
                                <span className="underline underline-offset-4">shipping &amp; returns policies.</span>
                            </p>
                        </div>
                    </section>
                </>
            )}
        </div>
    );

    if (productView) return content;

    return (
        <ProductViewProvider product={product} mode={mode}>
            {content}
        </ProductViewProvider>
    );
}
