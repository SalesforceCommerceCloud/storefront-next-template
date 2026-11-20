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
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from 'react-i18next';
import { MAX_VISIBLE_TILES } from './constants';

const SKELETON_TILES = Array.from({ length: MAX_VISIBLE_TILES + 1 }, (_, index) => `last-order-tile-${index}`);

export function LastOrderCardSkeleton({ variant = 'default' }: { variant?: 'default' | 'compact' } = {}): ReactElement {
    const compact = variant === 'compact';
    const { t } = useTranslation('account');
    return (
        <div
            role="status"
            aria-label={t('lastOrderCard.loadingAriaLabel')}
            className={cn('overflow-hidden rounded-ui bg-separator', compact && 'h-full @container/last-order')}>
            <div
                className={cn(
                    'flex flex-col gap-6 p-6 md:p-8',
                    compact
                        ? 'grid grid-cols-1 @xl/last-order:grid-cols-2 items-center'
                        : 'md:flex-row md:items-center md:justify-between'
                )}>
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
                <div className={cn('grid grid-cols-5 gap-2', compact ? 'w-full max-w-sm' : 'md:justify-self-end')}>
                    {SKELETON_TILES.map((tile) => (
                        <Skeleton
                            key={tile}
                            className={cn(
                                'rounded-ui',
                                compact ? 'aspect-square w-full max-w-16' : 'size-16 sm:size-20 md:size-24'
                            )}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
