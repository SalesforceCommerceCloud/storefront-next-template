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
import { type ReactElement, useId } from 'react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { FilterValue, RefinementProps } from '../types';

/**
 * Flatten a (possibly hierarchical) category refinement to the leaf values rendered in the facet.
 *
 * SCAPI returns `cgid` refinement values as a tree (`ProductSearchRefinementValue.values`): a
 * parent category value carries its child category values in `.values`. When a parent category is
 * promoted into the sidebar (see `pages.category.sidebarCategoryRefinement`), we render a single
 * flat group of its direct children — e.g. the activity categories under an "activity" parent. A
 * value with no children is itself a leaf, so this also handles already-flat payloads.
 */
function toLeafValues(values: FilterValue[]): FilterValue[] {
    return values.flatMap((value) => (value.values?.length ? value.values : [value]));
}

/**
 * Single-select facet for a category (`cgid`) refinement promoted into the side-panel filters.
 *
 * SCAPI's `cgid` refinement is single-valued ("refinement per single category ID; multiple category
 * IDs are not supported"), so this renders a radio group, NOT checkboxes — selecting a category
 * replaces the active one (the parent `toggleFilter` treats `cgid` as exclusive). Used e.g. for the
 * footwear "Shop by Activity" facet. Reads/writes selection via `isFilterSelected`/`toggleFilter`.
 *
 * `label` is the refinement's display name (e.g. "Activity"); it names the radio group for assistive
 * technology (`aria-label`) so the composite widget isn't announced as an anonymous group.
 */
export default function RefineCategory({
    values,
    attributeId,
    isFilterSelected,
    toggleFilter,
    label,
}: RefinementProps & { label?: string }): ReactElement {
    const leafValues = toLeafValues(values);
    const groupId = useId();
    const selectedValue = leafValues.find((v) => isFilterSelected(attributeId, v.value))?.value ?? '';

    return (
        <RadioGroup
            className="space-y-1 mt-2"
            // Name the radiogroup for AT: the surrounding `role="group"` heading does not name the
            // nested radiogroup, so give it the refinement's own label (falls back to attributeId).
            aria-label={label || attributeId}
            value={selectedValue}
            // `cgid` is exclusive, so a change always selects a new value (never deselects).
            onValueChange={(value) => toggleFilter(attributeId, value)}>
            {leafValues.map((value: FilterValue, idx) => {
                const id = `${groupId}-${idx}`;
                return (
                    <label
                        key={`${attributeId}:${value.value}`}
                        htmlFor={id}
                        className="flex items-center p-2 hover:bg-muted/30 cursor-pointer">
                        <RadioGroupItem id={id} value={value.value} className="size-4" />
                        <span className="ml-3 text-sm font-medium">{value.label || value.value}</span>
                        {value.hitCount !== undefined && (
                            <span className="ml-auto text-xs bg-muted/50 px-2 py-1 rounded-full">{value.hitCount}</span>
                        )}
                    </label>
                );
            })}
        </RadioGroup>
    );
}
