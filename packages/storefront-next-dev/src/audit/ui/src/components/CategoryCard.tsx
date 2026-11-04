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
import { SEVERITIES, type Severity } from '../types';
import { cn } from '../lib/cn';
import { toneClass, weight } from '../lib/tone';

export interface CategorySummary {
    id: string;
    title: string;
    total: number;
    counts: Record<Severity, number>;
    topLine: string;
}

/** Overview tile for one category. Clicking it opens that category's section. */
export function CategoryCard({ category, onSelect }: { category: CategorySummary; onSelect: () => void }) {
    const present = SEVERITIES.filter((severity) => category.counts[severity] > 0);
    return (
        <button type="button" onClick={onSelect} className="audit-tile slds-box slds-box_link slds-theme_default">
            <div className="slds-grid slds-grid_align-spread slds-grid_vertical-align-center">
                <span className="slds-text-heading_small slds-truncate">{category.title}</span>
                <span className="slds-text-heading_medium">{category.total}</span>
            </div>
            <span className="audit-segments slds-m-top_small" aria-hidden="true">
                {present.map((severity) => (
                    <span
                        key={severity}
                        className={cn('audit-segments__item', toneClass(severity))}
                        style={weight(category.counts[severity])}
                    />
                ))}
            </span>
            {present.length ? (
                <ul className="slds-list_horizontal slds-has-dividers_right slds-m-top_x-small slds-text-body_small">
                    {present.map((severity) => (
                        <li key={severity} className={cn('slds-item audit-tone-text', toneClass(severity))}>
                            {category.counts[severity]} {severity}
                        </li>
                    ))}
                </ul>
            ) : null}
            <p className="audit-tile__footer slds-text-body_small slds-text-color_weak slds-truncate">
                {category.topLine}
            </p>
        </button>
    );
}
