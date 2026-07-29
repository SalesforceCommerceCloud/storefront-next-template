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

import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton component for the account addresses page content.
 * Matches the structure of the actual addresses page with vertically stacked address cards.
 */
export function AccountAddressesSkeleton() {
    const { t } = useTranslation('account');
    return (
        <div className="space-y-5">
            {/* Page Header Skeleton */}
            <Card className="bg-card border-border">
                <CardContent className="px-6 py-3">
                    <div className="flex items-start justify-between">
                        <div>
                            <h1 className="text-2xl font-semibold text-foreground mb-1">{t('navigation.addresses')}</h1>
                            <Skeleton className="h-4 w-48" />
                        </div>
                        <Skeleton className="h-9 w-36" />
                    </div>
                </CardContent>
            </Card>

            {/* Address Cards Vertical Stack Skeleton */}
            <div className="flex flex-col gap-4">
                {Array.from({ length: 2 }, (_, i) => i).map((index) => (
                    <Card key={index} className="rounded-ui border-border gap-0 py-4">
                        <CardHeader className="px-6 pb-2">
                            <CardTitle className="flex items-center gap-2">
                                <Skeleton className="h-5 w-32" />
                                {index === 0 && <Skeleton className="h-5 w-14" />}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-6 py-2">
                            <div className="space-y-1">
                                <Skeleton className="h-4 w-48" />
                                <Skeleton className="h-4 w-56" />
                            </div>
                        </CardContent>
                        <CardFooter className="gap-4 px-6 pt-2">
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-4 w-16" />
                        </CardFooter>
                    </Card>
                ))}
            </div>
        </div>
    );
}

export default AccountAddressesSkeleton;
