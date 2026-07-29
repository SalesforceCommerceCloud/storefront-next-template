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
import type { ShopperProducts } from '@/scapi';
import ImageGallery from '@/components/image-gallery';
import ProductInfo from './product-info';
import ProductCartActions from '@/components/product-cart-actions';
import ProductViewProvider from '@/providers/product-view';
import { useProductImages } from '@/hooks/product/use-product-images';
import { useSelectedVariations } from '@/hooks/product/use-selected-variations';
import { isProductSet, isProductBundle } from '@/lib/product/product-utils';
import CollapsibleHtmlSection from '@/components/collapsible-section/collapsible-html-section';
import { useTranslation } from 'react-i18next';
import { UITarget } from '@/targets/ui-target';

interface ProductViewProps {
    product: ShopperProducts.schemas['Product'];
    mode?: 'add' | 'edit';
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
export default function ProductView({ product }: ProductViewProps): ReactElement {
    // Calculate directly without useMemo since these are simple operations
    const isProductASet = isProductSet(product);
    const isProductABundle = isProductBundle(product);

    // Get selected attributes from URL parameters for image gallery
    const selectedAttributes = useSelectedVariations({ product });
    const { galleryImages } = useProductImages({
        product,
        selectedAttributes,
    });

    const { t } = useTranslation('product');

    return (
        <ProductViewProvider product={product} mode="add">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-12">
                {/* Left Column - Image Gallery + Description */}
                <div className="order-1">
                    <ImageGallery
                        key={product.id}
                        images={galleryImages}
                        eager={!isProductASet && !isProductABundle}
                        showNavigationArrows
                        navigationArrowSize="lg"
                        productName={product.name}
                    />
                    <UITarget targetId="sfcc.pdp.agent.productHelper" />
                    {product.longDescription && product.longDescription !== product.shortDescription && (
                        <CollapsibleHtmlSection
                            label={`${t('description')}:`}
                            content={product.longDescription}
                            contentType="bulleted-list"
                            defaultOpen
                            className="mt-6"
                        />
                    )}
                </div>

                {/* Right Column - Product Info */}
                <div className="order-2">
                    <ProductInfo product={product} />
                    <ProductCartActions product={product} />
                    <UITarget targetId="sfcc.pdp.returnsWarranty" />
                    {/* @sfdc-extension-block-start SFDC_EXT_SHIPPING_DELIVERY */}
                    <UITarget targetId="sfcc.pdp.estimatedDelivery" />
                    {/* @sfdc-extension-block-end SFDC_EXT_SHIPPING_DELIVERY */}
                    <UITarget targetId="sfcc.pdp.collapsibles" />
                </div>
            </div>
        </ProductViewProvider>
    );
}
