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
import { Combobox } from '../lib/slds';

export interface PicklistOption {
    id: string;
    label: string;
}

/** Read-only Lightning picklist used for list-view style filters. Controlled by `value`. */
export function PicklistFilter({
    label,
    options,
    value,
    onChange,
}: {
    label: string;
    options: PicklistOption[];
    value: string;
    onChange: (id: string) => void;
}) {
    const selected = options.find((option) => option.id === value) ?? options[0];
    return (
        <Combobox
            variant="readonly"
            labels={{ label }}
            options={options}
            selection={selected ? [selected] : []}
            menuItemVisibleLength={7}
            events={{
                onSelect: (_event: React.SyntheticEvent, data: { selection: PicklistOption[] }) => {
                    const next = data.selection[0];
                    if (next) onChange(next.id);
                },
            }}
        />
    );
}
