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
import { Funnel } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface FiltersButtonProps {
    /** Callback when button is clicked */
    onClick: () => void;
    /** Whether the filters panel is currently shown */
    isActive?: boolean;
    /** Number of selected filters currently applied */
    selectedFiltersCount?: number;
    /** Additional CSS classes */
    className?: string;
    /** Disables the button (e.g. when the search returned no facets to filter by). */
    disabled?: boolean;
}

/**
 * Button component that toggles the filters panel.
 */
export default function FiltersButton({
    onClick,
    isActive = false,
    selectedFiltersCount = 0,
    className,
    disabled = false,
}: FiltersButtonProps) {
    const { t } = useTranslation();
    const filtersLabel = t('categoryRefinements:filtersButtonLabel');
    const normalizedSelectedFiltersCount = Math.max(0, Math.floor(selectedFiltersCount));
    const hasSelectedFilters = normalizedSelectedFiltersCount > 0;
    const filtersAriaLabel = hasSelectedFilters
        ? t('categoryRefinements:filtersButtonLabelWithCount', {
              label: filtersLabel,
              count: normalizedSelectedFiltersCount,
          })
        : filtersLabel;

    return (
        <Button
            variant={isActive ? 'default' : 'outline'}
            onClick={onClick}
            disabled={disabled}
            className={cn(
                'text-sm font-normal leading-5 tracking-[-0.15px]',
                isActive ? 'text-primary-foreground' : 'text-foreground',
                className
            )}
            aria-label={filtersAriaLabel}
            aria-pressed={isActive}>
            <Funnel className="size-4 mr-2" />
            {filtersLabel}
            {hasSelectedFilters && (
                <Badge
                    variant="outline"
                    className="ml-2 min-w-5 px-1.5 border-0 bg-background text-foreground"
                    aria-hidden>
                    {normalizedSelectedFiltersCount}
                </Badge>
            )}
        </Button>
    );
}
