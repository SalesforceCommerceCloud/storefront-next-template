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

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FulfillmentOptionContributor, FulfillmentOptionDescriptor } from './types';

interface UseFulfillmentOptionsProps<OptionId extends string> {
    contributors: FulfillmentOptionContributor<OptionId>[];
    initialValue?: OptionId;
    synchronizeSelection?: (value: OptionId) => void;
    preventUnavailableSelectionChange?: boolean;
}

function canAutoSelect<OptionId extends string>(contributor: FulfillmentOptionContributor<OptionId>): boolean {
    return contributor.option.availability.available && contributor.canAutoSelect !== false;
}

function getInitialSelectedValue<OptionId extends string>(
    contributors: FulfillmentOptionContributor<OptionId>[],
    initialValue?: OptionId
): OptionId | undefined {
    if (initialValue) return initialValue;
    const [soleContributor] = contributors;
    if (contributors.length === 1 && canAutoSelect(soleContributor)) return soleContributor.option.id;
    const defaultContributor = contributors.find(({ defaultSelected }) => defaultSelected);
    if (!defaultContributor) return undefined;
    const fallback = contributors.find(canAutoSelect);
    return (canAutoSelect(defaultContributor) ? defaultContributor : fallback)?.option.id;
}

export function orderFulfillmentOptions<OptionId extends string>(
    options: FulfillmentOptionDescriptor<OptionId>[]
): FulfillmentOptionDescriptor<OptionId>[] {
    return [...options].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
}

export function useFulfillmentOptions<OptionId extends string>({
    contributors,
    initialValue,
    synchronizeSelection,
    preventUnavailableSelectionChange = false,
}: UseFulfillmentOptionsProps<OptionId>) {
    const orderedContributors = useMemo(
        () => [...contributors].sort((left, right) => (left.option.order ?? 0) - (right.option.order ?? 0)),
        [contributors]
    );
    const options = useMemo(() => orderedContributors.map(({ option }) => option), [orderedContributors]);
    const [value, setValue] = useState<OptionId | undefined>(() =>
        getInitialSelectedValue(orderedContributors, initialValue)
    );

    const select = useCallback(
        (nextValue: OptionId) => {
            const contributor = orderedContributors.find(({ option }) => option.id === nextValue);
            if (!contributor?.option.availability.available) return false;
            if (contributor.onSelect?.() === false) return false;
            setValue(nextValue);
            return true;
        },
        [orderedContributors]
    );

    const selectAvailable = useCallback(
        (nextValue: OptionId) => {
            const contributor = orderedContributors.find(({ option }) => option.id === nextValue);
            if (!contributor || !canAutoSelect(contributor)) return false;
            setValue(nextValue);
            return true;
        },
        [orderedContributors]
    );

    useEffect(() => {
        if (value) synchronizeSelection?.(value);
    }, [synchronizeSelection, value]);

    useEffect(() => {
        if (preventUnavailableSelectionChange) return;
        if (!value) {
            const initialSelectedValue = getInitialSelectedValue(orderedContributors, initialValue);
            if (initialSelectedValue) selectAvailable(initialSelectedValue);
            return;
        }
        const selected = orderedContributors.find(({ option }) => option.id === value);
        if (selected?.option.availability.available) return;
        const fallback = orderedContributors.find(canAutoSelect);
        if (fallback) selectAvailable(fallback.option.id);
        else setValue(undefined);
    }, [initialValue, orderedContributors, preventUnavailableSelectionChange, selectAvailable, value]);

    return { value, setValue, select, options };
}
