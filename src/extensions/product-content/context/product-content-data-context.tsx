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
/** @sfdc-extension-file SFDC_EXT_PRODUCT_CONTENT */
/* eslint-disable react-refresh/only-export-components -- provider and hook are co-located by design */
import { createContext, useContext, type PropsWithChildren, type ReactElement } from 'react';
import type { ShopperProducts } from '@/scapi';
import type { ReturnsAndWarrantyData, HtmlContent } from '@/extensions/product-content/lib/api/product-content.server';

export interface ProductContentDataContextValue {
    product: ShopperProducts.schemas['Product'];
    returnsWarrantyPromise: Promise<ReturnsAndWarrantyData>;
    pdpCollapsiblesPromise: Promise<Array<HtmlContent | null>>;
}

const ProductContentDataContext = createContext<ProductContentDataContextValue | null>(null);

export function useProductContentData(): ProductContentDataContextValue | null {
    return useContext(ProductContentDataContext);
}

export type ProductContentDataProviderProps = PropsWithChildren<ProductContentDataContextValue>;

export function ProductContentDataProvider({
    product,
    returnsWarrantyPromise,
    pdpCollapsiblesPromise,
    children,
}: ProductContentDataProviderProps): ReactElement {
    return (
        <ProductContentDataContext.Provider value={{ product, returnsWarrantyPromise, pdpCollapsiblesPromise }}>
            {children}
        </ProductContentDataContext.Provider>
    );
}
