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
import { type ReactElement, useCallback, useId, useMemo, useState } from 'react';
import { useLocation, useNavigation } from 'react-router';
import { useNavigate } from '@/hooks/use-navigate';

import type { ShopperSearch } from '@/scapi';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, Minus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Typography } from '@/components/typography';
import { UITarget } from '@/targets/ui-target';
import type { FilterValue, RefinementProps } from './types';
import RefineDefault from './refine-default';
import RefineColor from './refine-color';
import RefineSize from './refine-size';
import RefinePrice from './refine-price';
// @sfdc-extension-line SFDC_EXT_BOPIS
import RefineInventory from '@/extensions/bopis/components/refine-inventory';

export default function CategoryRefinements({
    result,
    refine = [],
}: {
    result: ShopperSearch.schemas['ProductSearchResult'];
    refine: string[];
}): ReactElement {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const navigation = useNavigation();
    const isPending = navigation.state !== 'idle';

    /**
     * Optimistic refinements derived from the in-flight navigation target.
     *
     * When a user toggles a filter, `navigate()` updates the URL which triggers a loader call. While that navigation
     * is pending, `navigation.location` holds the target location, allowing us to read the intended refine params
     * immediately.
     *
     * Note: `navigation.location` is inherently tied to the pending state — it's only defined while
     * `navigation.state !== 'idle'`, and both reset in the same render cycle once the navigation completes. An
     * additional `isPending` guard is therefore not needed here.
     *
     * Minor trade-off: `useNavigation()` is global — it reflects any in-flight navigation, not just filter toggles.
     * In practice this is acceptable because if a different navigation starts, the entire page is about to change
     * anyway.
     */
    const effectiveRefines = navigation.location
        ? new URLSearchParams(navigation.location.search).getAll('refine')
        : refine;

    // Track which sections should be expanded (default open if has active filters)
    const hasActiveFilter = useCallback(
        (attributeId: string) => {
            return effectiveRefines.some((r) => r.startsWith(`${attributeId}=`));
        },
        [effectiveRefines]
    );

    // Category (`cgid`) selection is handled by QuickFilters, not the side filters panel.
    const refinements = useMemo(
        () => (result?.refinements || []).filter((refinement) => refinement.attributeId !== 'cgid'),
        [result]
    );

    const toggleFilter = useCallback(
        (attributeId: string, value: string) => {
            const params = new URLSearchParams(location.search);
            const refines = params.getAll('refine');
            const refinePair = `${attributeId}=${value}`;

            let nextRefines: string[];
            if (refines.includes(refinePair)) {
                // Remove this refinement
                nextRefines = refines.filter((r) => r !== refinePair);
            } else {
                // Exclusive refinements - only one value can be selected at a time
                const exclusiveRefinements = [
                    'price',
                    // @sfdc-extension-line SFDC_EXT_BOPIS
                    'ilids',
                ];
                if (exclusiveRefinements.includes(attributeId)) {
                    // Remove all refinements for this attribute first
                    nextRefines = [...refines.filter((r) => !r.startsWith(`${attributeId}=`)), refinePair];
                } else {
                    nextRefines = [...refines, refinePair];
                }
            }

            // Rebuild search params with the new refines
            params.delete('refine');
            nextRefines.forEach((r) => params.append('refine', r));
            params.set('offset', '0');

            const nextSearch = `?${params.toString()}`;

            void navigate({
                pathname: location.pathname,
                search: nextSearch,
            });
        },
        [location, navigate]
    );

    // Check if a filter value is selected (uses optimistic state)
    const isFilterSelected = useCallback(
        (attributeId: string, value: string) => {
            return effectiveRefines.includes(`${attributeId}=${value}`);
        },
        [effectiveRefines]
    );

    // Render the appropriate filter component based on type
    const renderFilterValues = (
        refinement: ShopperSearch.schemas['ProductSearchRefinement'] & { values: FilterValue[] }
    ) => {
        const { attributeId, values } = refinement;
        const refinementProps: RefinementProps = {
            values,
            attributeId,
            isFilterSelected,
            toggleFilter,
        };

        switch (attributeId) {
            case 'c_refinementColor':
                return <RefineColor {...refinementProps} />;
            case 'c_size':
                return <RefineSize {...refinementProps} />;
            case 'price':
                return <RefinePrice {...refinementProps} result={result} />;
            default:
                return <RefineDefault {...refinementProps} />;
        }
    };

    // No refinements available
    if (refinements.length === 0) {
        return (
            <div className="border p-4">
                <p className="text-muted-foreground text-sm">{t('categoryRefinements:noFilterOptionsAvailable')}</p>
            </div>
        );
    }

    return (
        <UITarget targetId="sfcc.plp.search.filters">
            <div className={isPending ? 'pointer-events-none opacity-50 transition-opacity' : ''}>
                {/*  @sfdc-extension-block-start SFDC_EXT_BOPIS */}
                <RefineInventory
                    isFilterSelected={isFilterSelected}
                    hasActiveFilter={hasActiveFilter}
                    toggleFilter={toggleFilter}
                />
                {/*  @sfdc-extension-block-end SFDC_EXT_BOPIS */}

                {/* Individual collapsible sections for each refinement category */}
                {refinements.map((refinement) => {
                    const { values, attributeId, label } = refinement;
                    if (!Array.isArray(values) || !values.length) {
                        return null;
                    }

                    return (
                        <FilterSection
                            key={attributeId}
                            label={label || attributeId}
                            defaultOpen={hasActiveFilter(attributeId)}>
                            {renderFilterValues(
                                refinement as ShopperSearch.schemas['ProductSearchRefinement'] & {
                                    values: FilterValue[];
                                }
                            )}
                        </FilterSection>
                    );
                })}
            </div>
        </UITarget>
    );
}

/**
 * Individual filter section with collapsible behavior.
 * Shows Plus icon when collapsed, Minus when expanded.
 */
function FilterSection({
    label,
    defaultOpen = false,
    children,
}: {
    label: string;
    defaultOpen?: boolean;
    children: ReactElement;
}): ReactElement {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const labelId = useId();

    return (
        <section>
            <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border border-border mb-4 rounded-ui">
                <Typography variant="small" as="h3" className="leading-normal p-4 transition-colors hover:bg-muted/60">
                    <CollapsibleTrigger className="flex items-center justify-between w-full text-left px-1 py-1 -mx-1 cursor-pointer">
                        <Typography variant="small" as="span" id={labelId} className="font-medium">
                            {label}
                        </Typography>
                        {isOpen ? <Minus className="size-4" /> : <Plus className="size-4" />}
                    </CollapsibleTrigger>
                </Typography>
                <CollapsibleContent className="px-4 pb-4">
                    <div role="group" aria-labelledby={labelId}>
                        {children}
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </section>
    );
}
