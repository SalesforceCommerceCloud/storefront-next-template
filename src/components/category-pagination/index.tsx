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
import { type JSX, useCallback, useMemo } from 'react';
import { useLocation, useNavigation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@/hooks/use-navigate';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getPaginationItems } from '@/lib/pagination-utils';

export default function CategoryPagination({
    limit,
    offset,
    total,
}: {
    limit: number;
    offset: number;
    total: number;
}): JSX.Element | null {
    const navigate = useNavigate();
    const location = useLocation();
    const navigation = useNavigation();
    const { t } = useTranslation('category');
    const isPending = navigation.state !== 'idle';

    /**
     * Optimistic offset derived from the in-flight navigation target.
     *
     * While a navigation is pending, `navigation.location` holds the target location, allowing us to read the
     * intended offset param immediately. Once the navigation settles, we fall back to the server-provided value.
     */
    const effectiveOffset = navigation.location
        ? Number(new URLSearchParams(navigation.location.search).get('offset') || offset)
        : offset;

    const totalPages = Math.ceil(total / limit);
    const current = Math.floor(effectiveOffset / limit) + 1;
    const pageNumbers = useMemo(() => getPaginationItems(totalPages, current), [totalPages, current]);

    const navigatePage = useCallback(
        (page: number) => {
            const params = new URLSearchParams(location.search);
            params.set('offset', String((page - 1) * limit));
            void navigate({
                ...location,
                search: `?${params.toString()}`,
            });
        },
        [location, navigate, limit]
    );

    if (totalPages <= 1) {
        return null;
    }

    return (
        <div className="flex justify-center">
            <nav
                data-slot="pagination"
                className={`flex items-center gap-1${isPending ? ' pointer-events-none opacity-50 transition-opacity' : ''}`}
                aria-label={t('pagination.label')}>
                <Button
                    variant="ghost"
                    className="h-9 cursor-pointer gap-1 px-2.5"
                    onClick={() => void navigatePage(current - 1)}
                    disabled={current <= 1}
                    aria-label={t('pagination.previousPage')}>
                    <ChevronLeft className="size-4" />
                    <span>{t('pagination.previous')}</span>
                </Button>

                {pageNumbers.map((item) =>
                    typeof item === 'object' ? (
                        <span
                            key={`ellipsis-${item.key}`}
                            className="flex size-9 items-center justify-center text-foreground/80">
                            ...
                        </span>
                    ) : (
                        <Button
                            key={item}
                            onClick={() => void navigatePage(item)}
                            disabled={current === item}
                            variant={current === item ? 'outline' : 'ghost'}
                            className="size-9 cursor-pointer"
                            aria-label={t('pagination.page', { number: item })}
                            aria-current={current === item ? 'page' : undefined}>
                            {item}
                        </Button>
                    )
                )}

                <Button
                    variant="ghost"
                    className="h-9 cursor-pointer gap-1 px-2.5"
                    onClick={() => void navigatePage(current + 1)}
                    disabled={current === totalPages}
                    aria-label={t('pagination.nextPage')}>
                    <span>{t('pagination.next')}</span>
                    <ChevronRight className="size-4" />
                </Button>
            </nav>
        </div>
    );
}
