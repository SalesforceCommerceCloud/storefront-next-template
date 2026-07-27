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
import { Button } from '@/components/ui/button';
import type { RefinementProps } from '../types';

export default function RefineSize({
    values,
    attributeId,
    isFilterSelected,
    toggleFilter,
}: RefinementProps): ReactElement {
    return (
        <div className="flex flex-wrap gap-2 mt-2">
            {values.map((value) => {
                const isSelected = isFilterSelected(attributeId, value.value);

                return (
                    <Button
                        key={`${attributeId}:${value.value}`}
                        variant="outline"
                        aria-pressed={isSelected}
                        onClick={() => toggleFilter(attributeId, value.value)}
                        className={`${isSelected ? 'border-foreground/80' : ''}`}>
                        {value.label || value.value}
                        {value.hitCount !== undefined && (
                            <span className="ml-auto text-xs bg-muted/50 px-2 py-1 rounded-full">{value.hitCount}</span>
                        )}
                    </Button>
                );
            })}
        </div>
    );
}
