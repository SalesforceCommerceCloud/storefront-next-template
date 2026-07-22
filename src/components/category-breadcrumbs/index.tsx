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
import { useTranslation } from 'react-i18next';
import { Link } from '@/components/link';
import type { ShopperProducts } from '@/scapi';
import { ChevronRight } from 'lucide-react';
import { routes, routeHref } from '@/route-paths';

type PathRecord = Required<ShopperProducts.schemas['Category']>['parentCategoryTree'][0];

export default function CategoryBreadcrumbs({
    category,
}: {
    category: ShopperProducts.schemas['Category'];
}): ReactElement {
    const { t } = useTranslation('category');
    const items: PathRecord[] = category.parentCategoryTree ?? [{ id: category.id, name: category.name }];
    return (
        <nav aria-label={t('breadcrumbs.label')} className="mb-6">
            <ol className="flex flex-wrap items-center text-sm font-normal leading-5 text-foreground">
                <li key="home" className="flex items-center">
                    <Link to={routes.home} className="hover:underline">
                        {t('breadcrumbs.home')}
                    </Link>
                </li>
                {items.map((item, index) => {
                    const isLast = index === items.length - 1;
                    return (
                        <li key={item.id} className="flex items-center">
                            <ChevronRight className="mx-1 size-3" />
                            <Link
                                to={routeHref(routes.category, { categoryId: item.id ?? '' })}
                                className="hover:underline"
                                aria-current={isLast ? 'page' : undefined}>
                                {item.name}
                            </Link>
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}
