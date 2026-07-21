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
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Empty-cart skeleton mirrors `cart-empty.tsx`:
 *   - Full-width `bg-background` panel inside `section-container py-8 lg:py-14`
 *   - Padding `p-8 md:p-16`, centered content
 *   - Single 24×24 icon, h2 title, single paragraph, single CTA button
 */
function CartEmptySkeleton(): ReactElement {
    return (
        <div className="bg-muted flex-1 min-w-full w-full" data-testid="sf-cart-empty-skeleton" aria-busy="true">
            <div className="section-container py-8 lg:py-14">
                <div className="bg-background p-8 md:p-16 text-center">
                    {/* Empty Cart Icon (real svg is w-24 h-24 with mb-6) */}
                    <Skeleton className="w-24 h-24 mx-auto mb-6 rounded-full" />

                    {/* Empty Cart Title (Typography h2 — text-2xl) */}
                    <Skeleton className="h-8 w-40 mx-auto mb-2" />

                    {/* Empty Cart Message (single text-sm paragraph) */}
                    <Skeleton className="h-4 w-72 max-w-full mx-auto mb-8" />

                    {/* Action Button — real EmptyCart only ever renders one button */}
                    <Skeleton className="h-9 w-36 mx-auto rounded-ui" />
                </div>
            </div>
        </div>
    );
}

export default function CartSkeleton({
    productItemCount,
    recommendationsSlot,
}: {
    productItemCount?: number;
    recommendationsSlot?: ReactNode;
}): ReactElement {
    const { t } = useTranslation('cart');

    // Announce the loading state to screen readers. role="status" (aria-live="polite")
    // reads the label out when the skeleton mounts, without interrupting the shopper.
    const loadingStatus = (
        <span role="status" className="sr-only">
            {t('loadingLabel', { defaultValue: 'Loading your cart' })}
        </span>
    );

    if (!productItemCount) {
        return (
            <>
                {loadingStatus}
                <CartEmptySkeleton />
            </>
        );
    }

    const productItemSkeletonIds = Array.from(
        { length: productItemCount },
        (_, index) => `sf-product-item-skeleton-${index + 1}`
    );

    return (
        <div
            className="flex-1 min-h-screen bg-background mb-10 md:mb-10 pb-32 md:pb-0"
            data-testid="sf-cart-skeleton"
            aria-busy="true">
            {loadingStatus}
            <div className="section-container">
                {/* Page heading — Typography h1 (text-4xl font-bold) with mb-6 */}
                <Skeleton className="h-10 w-48 mb-6" />

                <div className="grid grid-cols-1 lg:grid-cols-[66%_1fr] lg:gap-11">
                    <div className="md:order-2 lg:order-1">
                        <div className="md:p-8 p-3 rounded-ui border border-muted-foreground/10 mb-3">
                            {/* CartTitle: Truck icon + delivery heading + optional address */}
                            <div className="flex items-center gap-2 mb-6">
                                <Skeleton className="size-[1.125rem] shrink-0 rounded-ui" />
                                <div className="space-y-1">
                                    <Skeleton className="h-6 w-48" />
                                    <Skeleton className="h-4 w-56 hidden md:block" />
                                </div>
                            </div>

                            {productItemSkeletonIds.map((id, index) => (
                                <div
                                    key={id}
                                    className={
                                        index < productItemSkeletonIds.length - 1
                                            ? 'border-b border-muted-foreground/10'
                                            : undefined
                                    }>
                                    <div className="px-3 py-4 md:px-6 md:py-7">
                                        <div className="grid md:grid-cols-[140px_1fr] grid-cols-[72px_1fr] gap-5 min-w-0">
                                            <div className="flex-shrink-0 flex items-start justify-center">
                                                <Skeleton className="aspect-square md:w-32 w-16" />
                                            </div>
                                            <div className="flex-1 space-y-3 min-w-0">
                                                <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-2 md:gap-x-6 md:gap-y-1 min-w-0">
                                                    {/* Left column — name, variation attrs, secondary actions */}
                                                    <div className="min-w-0 space-y-2">
                                                        <Skeleton className="h-7 w-3/4" />
                                                        <Skeleton className="h-4 w-1/2" />
                                                        <Skeleton className="h-4 w-1/3" />
                                                        <div className="flex gap-3 pt-1">
                                                            <Skeleton className="h-4 w-16" />
                                                            <Skeleton className="h-4 w-12" />
                                                            <Skeleton className="h-4 w-24" />
                                                        </div>
                                                    </div>
                                                    {/* Right column — price, quantity picker, gift row */}
                                                    <div className="flex min-w-0 flex-col items-end gap-2 md:gap-4 md:row-span-2">
                                                        {/* Per-line delivery selector (BOPIS) is desktop-only */}
                                                        <Skeleton className="hidden md:block h-9 w-32 rounded-ui" />
                                                        <div className="flex w-full max-w-full shrink-0 flex-col items-end gap-2 md:gap-3">
                                                            <Skeleton className="h-7 w-[8.5rem]" />
                                                        </div>
                                                        {/* CartQuantityPicker stepper (≈ h-9 w-32) */}
                                                        <div className="flex shrink-0 justify-end gap-1">
                                                            <Skeleton className="h-9 w-9 rounded-ui" />
                                                            <Skeleton className="h-9 w-12 rounded-ui" />
                                                            <Skeleton className="h-9 w-9 rounded-ui" />
                                                        </div>
                                                        {/* Gift checkbox + label row */}
                                                        <div className="flex w-full min-w-0 shrink-0 justify-end">
                                                            <Skeleton className="h-5 w-44" />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Order Summary — desktop only, mirrors OrderSummary Card */}
                    <div className="hidden md:block md:order-1 lg:order-2">
                        <Card className="!py-4">
                            <CardContent className="px-[var(--cart-summary-px)]">
                                <div className="space-y-4">
                                    <Skeleton className="h-7 w-28" />
                                    <hr className="mx-[calc(var(--cart-summary-px)*-1)] border-border" />
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <Skeleton className="h-5 w-20" />
                                            <Skeleton className="h-5 w-16" />
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <Skeleton className="h-5 w-20" />
                                            <Skeleton className="h-5 w-12" />
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <Skeleton className="h-5 w-12" />
                                            <Skeleton className="h-5 w-12" />
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <Skeleton className="h-5 w-28" />
                                            <Skeleton className="h-5 w-16" />
                                        </div>
                                    </div>
                                    {/* Promo code form */}
                                    <hr className="mx-[calc(var(--cart-summary-px)*-1)] border-border" />
                                    <div className="flex items-center justify-between py-2">
                                        <Skeleton className="h-5 w-36" />
                                        <Skeleton className="h-5 w-4" />
                                    </div>
                                    {/* Checkout action */}
                                    <hr className="mx-[calc(var(--cart-summary-px)*-1)] border-border" />
                                    <Skeleton className="h-9 w-full mt-2 rounded-ui" />
                                    {/* Payment method icons (4 × 40×32) */}
                                    <div className="flex justify-center">
                                        <Skeleton className="h-8 w-10 mr-2 rounded-ui" />
                                        <Skeleton className="h-8 w-10 mr-2 rounded-ui" />
                                        <Skeleton className="h-8 w-10 mr-2 rounded-ui" />
                                        <Skeleton className="h-8 w-10 mr-2 rounded-ui" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {recommendationsSlot}
            </div>

            {/*
                Mobile order summary + checkout action — real CartContent renders this as a
                fixed-bottom bar on `md:hidden`. Match position so the skeleton occupies the
                same screen real estate (the `pb-32 md:pb-0` above reserves the spacer).
            */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border">
                <div className="px-4 py-4 flex items-center justify-between border-b border-border">
                    <Skeleton className="h-5 w-44" />
                    <Skeleton className="h-5 w-4" />
                </div>
                <div className="px-4 py-4">
                    <Skeleton className="h-9 w-full rounded-ui" />
                </div>
            </div>
        </div>
    );
}
