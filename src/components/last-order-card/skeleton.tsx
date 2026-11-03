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
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from 'react-i18next';
import { MAX_VISIBLE_TILES } from './constants';

export function LastOrderCardSkeleton(): ReactElement {
    const { t } = useTranslation('account');
    return (
        <div
            role="status"
            aria-label={t('lastOrderCard.loadingAriaLabel')}
            className="overflow-hidden rounded-ui bg-separator">
            <div className="flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between md:p-8">
                <div className="max-w-md">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="mt-2 h-9 w-64" />
                    <Skeleton className="mt-3 h-4 w-48" />
                    <Skeleton className="mt-2 h-4 w-full" />
                    <div className="mt-6 flex gap-3">
                        <Skeleton className="h-10 w-32" />
                        <Skeleton className="h-10 w-36" />
                    </div>
                </div>
                <div className="grid grid-cols-5 gap-2 md:justify-self-end">
                    {Array.from({ length: MAX_VISIBLE_TILES + 1 }).map((_, i) => (
                        // oxlint-disable-next-line react/no-array-index-key -- static skeleton tiles
                        <Skeleton key={i} className="size-16 rounded-ui sm:size-20 md:size-24" />
                    ))}
                </div>
            </div>
        </div>
    );
}
