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
import ProductInfo from '@/components/product-view/product-info';
import ProductCartActions from '@/components/product-cart-actions';
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
export default function ProductView({ product, mode = 'add' }: ProductViewProps): ReactElement {
    const productView = useOptionalProductView();
    const isProductASet = isProductSet(product);
    const isProductABundle = isProductBundle(product);
    const selectedAttributes = useSelectedVariations({ product });
    const { galleryImages } = useProductImages({ product, selectedAttributes });
    const { t } = useTranslation('product');
    // Furniture opts into the mosaic PDP gallery via config; every other vertical stays stacked.
    const galleryLayout = uiConfig.pages.product.galleryLayout ?? 'stacked';

    const content = (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-12">
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

            <div className="order-2">
                <ProductInfo
                    product={product}
                    // @sfdc-extension-block-start SFDC_EXT_BOPIS
                    // @sfdc-extension-line SFDC_EXT_SHIPPING_DELIVERY
                    enableDeliveryEstimatePresentation
                    // @sfdc-extension-block-end SFDC_EXT_BOPIS
                />
                <ProductCartActions product={product} />
                <UITarget targetId="sfcc.pdp.returnsWarranty" />
                <UITarget targetId="sfcc.pdp.collapsibles" />
            </div>
        </div>
    );

    if (productView) return content;

    return (
        <ProductViewProvider product={product} mode={mode}>
            {content}
        </ProductViewProvider>
    );
}
