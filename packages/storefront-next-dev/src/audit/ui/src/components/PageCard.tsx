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
import type { Page } from '../lib/audit';
import { CORE_METRICS, PAGE_NAMES, metric, metricIsBad, scoreOf, urlPath } from '../lib/playhouse';
import { cn } from '../lib/cn';
import { ScoreRing } from './ScoreRing';
import { MetricStat } from './MetricStat';

/** Entry-page tile: score and the four core vitals. */
export function PageCard({ page, selected, onSelect }: { page: Page; selected?: boolean; onSelect?: () => void }) {
    const inner = (
        <>
            <div className="slds-media slds-media_center">
                <div className="slds-media__body slds-truncate">
                    <div className="slds-text-heading_small slds-truncate">{PAGE_NAMES[page.label] ?? page.label}</div>
                    <div className="slds-text-body_small slds-text-color_weak slds-text-font_monospace slds-truncate">
                        {urlPath(page.url)}
                    </div>
                </div>
                <div className="slds-media__figure slds-media__figure_reverse">
                    <ScoreRing score={scoreOf(page)} />
                </div>
            </div>
            <div className="audit-metric-row slds-m-top_small">
                {CORE_METRICS.map((label) => (
                    <MetricStat
                        key={label}
                        label={label}
                        value={metric(page, label)?.display ?? '—'}
                        ok={invert(metricIsBad(page, label))}
                        size="small"
                        className="audit-metric-row__item"
                    />
                ))}
            </div>
        </>
    );

    if (onSelect) {
        return (
            <button
                type="button"
                onClick={onSelect}
                aria-pressed={selected}
                className={cn(
                    'audit-tile slds-box slds-box_link slds-theme_default',
                    selected && 'audit-tile_selected'
                )}>
                {inner}
            </button>
        );
    }
    return <article className="audit-tile slds-box slds-theme_default">{inner}</article>;
}

const invert = (bad: boolean | undefined): boolean | undefined => (bad === undefined ? undefined : !bad);
