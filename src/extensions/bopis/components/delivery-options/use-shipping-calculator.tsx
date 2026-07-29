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
/** @sfdc-extension-file SFDC_EXT_SHIPPING_DELIVERY */
import { type ComponentType, type ReactNode, useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import type { ShopperProducts } from '@/scapi';

const shippingCalculatorImport = () => import('./shipping-calculator');
// oxlint-disable-next-line react/only-export-components -- oxlint flags the co-exported Page Designer metadata class; eslint-plugin-react-refresh does not
const ShippingCalculator = lazy(shippingCalculatorImport) as ComponentType<{
    onCalculate: (zipCode: string, days: number) => void;
    productId: string;
}>;

const SKELETON_FALLBACK = (
    <div className="p-4 border border-muted-foreground/20 bg-card animate-pulse">
        <div className="space-y-3">
            <div className="h-4 w-32 rounded-ui bg-muted" />
            <div className="flex gap-2">
                <div className="h-10 flex-1 rounded-ui bg-muted" />
                <div className="h-10 w-24 rounded-ui bg-muted" />
            </div>
        </div>
    </div>
);

interface UseShippingCalculatorOptions {
    isInBasket: boolean;
    product: ShopperProducts.schemas['Product'];
    selectedDeliveryOption: string | undefined;
}

interface UseShippingCalculatorResult {
    deliveryDays: number | undefined;
    calculatedZipCode: string | undefined;
    ShippingCalculatorSlot: ReactNode;
}

export function useShippingCalculator({
    isInBasket,
    product,
    selectedDeliveryOption,
}: UseShippingCalculatorOptions): UseShippingCalculatorResult {
    const [deliveryDays, setDeliveryDays] = useState<number | undefined>(undefined);
    const [calculatedZipCode, setCalculatedZipCode] = useState<string | undefined>(undefined);

    const handleCalculate = useCallback((zipCode: string, days: number) => {
        setCalculatedZipCode(zipCode);
        setDeliveryDays(days);
    }, []);

    useEffect(() => {
        if (!isInBasket) {
            shippingCalculatorImport().catch(() => undefined);
        }
    }, [isInBasket]);

    const productId = (product.currentVariant as { productId?: string } | undefined)?.productId ?? product.id;

    const ShippingCalculatorSlot = useMemo(
        () =>
            selectedDeliveryOption === 'delivery' ? (
                <Suspense fallback={SKELETON_FALLBACK}>
                    <ShippingCalculator onCalculate={handleCalculate} productId={productId} />
                </Suspense>
            ) : null,
        [selectedDeliveryOption, handleCalculate, productId]
    );

    return { deliveryDays, calculatedZipCode, ShippingCalculatorSlot };
}
