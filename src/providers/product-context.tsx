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

import { createContext, useContext, type PropsWithChildren } from 'react';
import type { ShopperProducts } from '@/scapi';

/**
 * Simple context for sharing product data across components.
 */
interface ProductContextValue {
    product: ShopperProducts.schemas['Product'];
}

const ProductContext = createContext<ProductContextValue | null>(null);

interface ProductProviderProps {
    product: ShopperProducts.schemas['Product'];
}

/**
 * Provider for product data that makes the product available via context.
 *
 * @example
 * ```tsx
 * <ProductProvider product={product}>
 *   <ProductRecommendations />
 *   <OtherComponents />
 * </ProductProvider>
 * ```
 */
export const ProductProvider = ({ children, product }: PropsWithChildren<ProductProviderProps>) => {
    return <ProductContext.Provider value={{ product }}>{children}</ProductContext.Provider>;
};

/**
 * Hook to access product from ProductContext.
 * Returns null if not within a ProductProvider.
 *
 * @returns The product from context, or null if not available
 */
// oxlint-disable-next-line react-refresh/only-export-components
export const useProduct = () => {
    const context = useContext(ProductContext);
    return context?.product ?? null;
};
