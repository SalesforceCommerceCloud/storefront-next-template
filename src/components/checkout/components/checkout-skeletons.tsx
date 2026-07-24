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

import type { ReactElement } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function ExpressPaymentsSkeleton(): ReactElement {
    return (
        <div className="space-y-6" data-testid="express-payments-skeleton">
            <Card className="flex flex-col items-center gap-3 p-6">
                <Skeleton className="h-5 w-32" />
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 w-full">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <Skeleton key={i} className="h-9 w-full" />
                    ))}
                </div>
            </Card>
            <div className="relative flex items-center gap-[15px]">
                <Skeleton className="flex-1 h-px" />
                <Skeleton className="h-5 w-28" />
                <Skeleton className="flex-1 h-px" />
            </div>
        </div>
    );
}

export function ContactInfoSkeleton(): ReactElement {
    return (
        <Card className="relative gap-4 min-h-[168px]">
            <CardHeader>
                <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-12 w-full" />
                </div>
                <div className="flex gap-2">
                    <Skeleton className="h-12 w-24" />
                    <Skeleton className="h-12 flex-1" />
                </div>
                <div className="flex justify-end pt-4">
                    <Skeleton className="h-12 w-56" />
                </div>
            </CardContent>
        </Card>
    );
}

export function ShippingAddressSkeleton(): ReactElement {
    return (
        <Card className="relative gap-4 min-h-[520px]">
            <CardHeader>
                <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-12 w-full" />
                    </div>
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-12 w-full" />
                    </div>
                </div>
                <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-12 w-full" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-12 w-full" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-16" />
                            <Skeleton className="h-12 w-full" />
                        </div>
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-16" />
                            <Skeleton className="h-12 w-full" />
                        </div>
                    </div>
                </div>
                <div className="flex justify-end pt-4">
                    <Skeleton className="h-12 w-56" />
                </div>
            </CardContent>
        </Card>
    );
}

export function ShippingOptionsSkeleton(): ReactElement {
    return (
        <Card className="relative gap-4 min-h-[180px]">
            <CardHeader>
                <Skeleton className="h-6 w-44" />
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-4">
                    <Skeleton className="h-4 w-32" />
                    {[1, 2].map((i) => (
                        <div key={i} className="flex items-center space-x-4 p-4 border-2 border-border">
                            <Skeleton className="h-5 w-5 rounded-full" />
                            <div className="flex-1 space-y-1">
                                <Skeleton className="h-4 w-full max-w-xs" />
                                <Skeleton className="h-4 w-32" />
                            </div>
                        </div>
                    ))}
                </div>
                <div className="flex justify-end pt-4">
                    <Skeleton className="h-12 w-56" />
                </div>
            </CardContent>
        </Card>
    );
}

export function PaymentSkeleton(): ReactElement {
    return (
        <Card className="relative gap-4 min-h-[280px]">
            <CardHeader>
                <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-4">
                    <Skeleton className="h-4 w-48" />
                    <div className="rounded-ui space-x-4 p-4 border-2 border-border flex items-center">
                        <Skeleton className="h-5 w-5 rounded-full" />
                        <div className="flex-1 flex justify-between items-center">
                            <Skeleton className="h-5 w-40" />
                            <Skeleton className="h-5 w-12" />
                        </div>
                    </div>
                </div>
                <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-12 w-full" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-12 w-full" />
                    </div>
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-12 w-full" />
                    </div>
                </div>
                <div className="flex items-center gap-2 py-2">
                    <Skeleton className="h-4 w-4 rounded-ui" />
                    <Skeleton className="h-4 w-64" />
                </div>
            </CardContent>
        </Card>
    );
}

export function PickupSkeleton(): ReactElement {
    return (
        <Card className="relative gap-4">
            <CardHeader>
                <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="border border-border p-4 space-y-3">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                </div>
                <div className="flex justify-end pt-4">
                    <Skeleton className="h-12 w-56" />
                </div>
            </CardContent>
        </Card>
    );
}

export function OrderSummarySkeleton(): ReactElement {
    return (
        <Card className="">
            <CardContent className="p-6">
                <div className="space-y-5" data-testid="order-summary-skeleton">
                    <div className="space-y-4" role="presentation">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="flex justify-between items-center">
                                <Skeleton className="h-5 w-24" />
                                <Skeleton className="h-5 w-16" />
                            </div>
                        ))}
                    </div>
                    <div className="space-y-4 w-full text-sm">
                        <div className="flex w-full justify-between items-center">
                            <Skeleton className="h-5 w-28" />
                            <Skeleton className="h-5 w-20" />
                        </div>
                    </div>
                    <div className="border border-border p-4">
                        <div className="flex items-center justify-between">
                            <Skeleton className="h-5 w-36" />
                            <Skeleton className="h-4 w-4" />
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export function MyCartSkeleton({ itemCount = 2 }: { itemCount?: number }): ReactElement {
    return (
        <div className="w-full" data-testid="my-cart-skeleton">
            <div className="divide-y divide-border -mx-[var(--cart-divider-extend,0px)] [&>*]:px-[var(--cart-divider-extend,0px)]">
                {Array.from({ length: itemCount }).map((_, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <div key={`cart-item-skeleton-${i}`} className="py-4" data-testid={`my-cart-item-skeleton-${i}`}>
                        <div className="flex gap-3 md:gap-4">
                            <Skeleton className="w-16 h-16 md:w-20 md:h-20 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start gap-2">
                                    <Skeleton className="h-5 w-3/4" />
                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                        <Skeleton className="h-4 w-16" />
                                    </div>
                                </div>
                                <div className="mt-1 space-y-0.5">
                                    <Skeleton className="h-4 w-24" />
                                    <Skeleton className="h-4 w-28" />
                                </div>
                                <div className="mt-1">
                                    <Skeleton className="h-5 w-16" />
                                </div>
                                <div className="mt-0.5">
                                    <Skeleton className="h-4 w-20" />
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function CheckoutSkeleton(): ReactElement {
    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-96" />
            </div>

            <div className="flex space-x-4">
                {Array.from({ length: 4 }, (_, index) => (
                    <div key={`progress-item-${index}`} className="flex items-center space-x-2">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <Skeleton className="h-4 w-16" />
                    </div>
                ))}
            </div>

            <div className="space-y-6">
                {Array.from({ length: 3 }, (_, index) => (
                    <div key={`form-section-item-${index}`} className="border p-6">
                        <Skeleton className="h-6 w-32 mb-4" />
                        <div className="space-y-3">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-2/3" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
