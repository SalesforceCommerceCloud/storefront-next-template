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
import type { Evidence as EvidenceItem } from '../types';
import { evidenceSource, formatEvidence } from '../lib/audit';
import { cn } from '../lib/cn';

/** Evidence blocks: source label + a code snippet, one per item. Identical citations show once. */
export function EvidenceList({ items }: { items: readonly EvidenceItem[] }) {
    if (!items.length) return <p className="slds-text-color_weak">No evidence supplied.</p>;
    const shown = new Map(items.map((item) => [`${evidenceSource(item)}\n${formatEvidence(item)}`, item]));
    return (
        <ul className="slds-list_vertical-space">
            {[...shown].map(([key, item]) => (
                <li key={key} className="slds-item">
                    <div
                        className={cn(
                            'slds-text-body_small slds-text-link',
                            item.type === 'source' && 'slds-text-font_monospace'
                        )}>
                        {evidenceSource(item)}
                    </div>
                    {formatEvidence(item) ? (
                        <pre className="audit-code slds-m-top_xx-small">{formatEvidence(item)}</pre>
                    ) : null}
                </li>
            ))}
        </ul>
    );
}
