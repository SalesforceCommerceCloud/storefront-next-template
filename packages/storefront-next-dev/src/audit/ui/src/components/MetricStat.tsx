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
import { cn } from '../lib/cn';
import { toneClass } from '../lib/tone';

/**
 * Label over a big value, the Lightning "highlights panel" pattern. A metric
 * that has a target is colored by whether it clears it; `ok: undefined` keeps
 * the neutral ink for values without a verdict.
 */
export function MetricStat({
    label,
    value,
    detail,
    ok,
    size = 'medium',
    className,
}: {
    label: string;
    value: React.ReactNode;
    detail?: React.ReactNode;
    ok?: boolean;
    size?: 'small' | 'medium';
    className?: string;
}) {
    return (
        <div className={cn('audit-stat', className)}>
            <div className="slds-text-title slds-truncate">{label}</div>
            <div
                className={cn(
                    'audit-stat__value',
                    size === 'small' ? 'slds-text-heading_small' : 'slds-text-heading_medium',
                    ok !== undefined && cn('audit-stat__value_toned', toneClass(ok ? 'pass' : 'critical'))
                )}>
                {value}
            </div>
            {detail ? <div className="slds-text-body_small slds-text-color_weak">{detail}</div> : null}
        </div>
    );
}
