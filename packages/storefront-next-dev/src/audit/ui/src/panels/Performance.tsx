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
import { useState } from 'react';
import type { AuditResult } from '../types';
import { categoryId, type Page } from '../lib/audit';
import { asObject } from '../lib/format';
import {
    CORE_METRICS,
    METRIC_TARGETS,
    PAGE_NAMES,
    metric,
    metricIsBad,
    mobileColdRunCount,
    scoreOf,
} from '../lib/playhouse';
import { Card, Icon, Tabs, TabsPanel } from '../lib/slds';
import { PageCard } from '../components/PageCard';
import { ScoreRing } from '../components/ScoreRing';
import { MetricStat } from '../components/MetricStat';
import { CategorySummary } from '../components/CategorySummary';
import { FindingsTable } from '../components/FindingsTable';
import { Notice } from '../components/Notice';
import { ServerWaterfall } from '../components/ServerWaterfall';
import { BundleBreakdown } from '../components/BundleBreakdown';
import { WATERFALL_RULE_ID, pageWaterfall } from '../lib/waterfall';
import { forRun } from '../lib/run';

type View = 'lighthouse' | 'server' | 'bundle';
const VIEWS: Array<{ id: View; label: string }> = [
    { id: 'lighthouse', label: 'Lighthouse' },
    { id: 'server', label: 'Server side rendering' },
    { id: 'bundle', label: 'Bundle size' },
];

const pageName = (page: Page): string => PAGE_NAMES[page.label] ?? page.label;

export function Performance({ result }: { result: AuditResult }) {
    const category = result.catalog.categories.find((item) => item.id === 'performance');
    const evaluations = result.evaluations.filter((item) => categoryId(item) === 'performance');
    const observations = result.observations.filter((item) => item.category === 'performance');

    // What to fix comes first, in the same table every category uses; the
    // page-scoped diagnostics below explain why.
    return (
        <div className="audit-stack">
            {category ? <CategorySummary category={category} evaluations={evaluations} icon="performance" /> : null}
            <FindingsTable
                result={result}
                heading="Performance findings"
                evaluations={evaluations}
                observations={observations}
            />
            <PageDiagnostics result={result} />
        </div>
    );
}

function PageDiagnostics({ result }: { result: AuditResult }) {
    const [pageIndex, setPageIndex] = useState(0);
    const [viewIndex, setViewIndex] = useState(0);

    const page = result.pages[pageIndex] ?? result.pages[0];
    if (!page) {
        return <Notice>Lighthouse was not run — no page diagnostics are available.</Notice>;
    }

    return (
        <section className="audit-stack" aria-labelledby="performance-diagnostics">
            <div>
                <div className="slds-grid slds-grid_vertical-align-end audit-gap_small slds-m-bottom_small">
                    <h2 id="performance-diagnostics" className="slds-text-heading_small">
                        Page diagnostics
                    </h2>
                    <span className="slds-text-body_small slds-text-color_weak">
                        every view below is scoped to the selected entry page
                    </span>
                </div>
                <div className="audit-tile-grid audit-tile-grid_wide">
                    {result.pages.map((entry, index) => (
                        <PageCard
                            key={entry.label}
                            page={entry}
                            selected={index === pageIndex}
                            onSelect={() => setPageIndex(index)}
                        />
                    ))}
                </div>
            </div>

            <Card
                heading={`Diagnostics — ${pageName(page)}`}
                icon={<Icon category="standard" name="performance" size="small" />}>
                <Tabs
                    id="performance-views"
                    selectedIndex={viewIndex}
                    onSelect={(index: number) => setViewIndex(index)}>
                    {VIEWS.map((entry) => (
                        <TabsPanel key={entry.id} label={entry.label}>
                            {entry.id === 'lighthouse' ? <LighthouseView page={page} /> : null}
                            {entry.id === 'server' ? <ServerView result={result} page={page} /> : null}
                            {entry.id === 'bundle' ? <BundleBreakdown result={result} label={page.label} /> : null}
                        </TabsPanel>
                    ))}
                </Tabs>
            </Card>
        </section>
    );
}

function LighthouseView({ page }: { page: Page }) {
    const report = reportHref(page);
    const runs = mobileColdRunCount(page);

    return (
        <div className="slds-p-around_medium">
            <div className="slds-grid slds-grid_vertical-align-center slds-grid_align-spread slds-m-bottom_small">
                <h3 className="slds-text-heading_small">
                    Lighthouse{' '}
                    <span className="slds-text-body_small slds-text-color_weak">
                        mobile · cold cache · v{page.playhouse.lighthouseVersion}
                        {runs > 0 ? (
                            <span
                                title={
                                    runs > 1
                                        ? `Playhouse ran Lighthouse ${runs} times. This report and the metrics below come from the one run whose LCP is closest to the median.`
                                        : 'Playhouse ran Lighthouse once for this page.'
                                }>
                                {' '}
                                · {runs > 1 ? `representative of ${runs} runs` : 'single run'}
                            </span>
                        ) : null}
                    </span>
                </h3>
                {report ? (
                    <a className="slds-button slds-button_neutral" href={report} target="_blank" rel="noreferrer">
                        Open full report
                        <Icon
                            category="utility"
                            name="new_window"
                            size="xx-small"
                            className="slds-button__icon slds-button__icon_right"
                        />
                    </a>
                ) : null}
            </div>
            <div className="slds-box slds-theme_default slds-grid slds-grid_vertical-align-center audit-gap_large slds-m-bottom_small">
                <ScoreRing score={scoreOf(page)} size="large" />
                <div className="audit-metric-row slds-col">
                    {CORE_METRICS.map((label) => {
                        const bad = metricIsBad(page, label);
                        return (
                            <MetricStat
                                key={label}
                                label={label}
                                value={metric(page, label)?.display ?? '—'}
                                ok={bad === undefined ? undefined : !bad}
                                detail={`target ${METRIC_TARGETS[label]}`}
                                className="audit-metric-row__item"
                            />
                        );
                    })}
                </div>
            </div>
            {report ? (
                <iframe
                    src={report}
                    title={`Lighthouse report — ${pageName(page)}`}
                    // The report renders itself with JS. Isolation comes from the
                    // server's CSP sandbox header (flags intersect with these), so
                    // that header is what must never gain allow-same-origin.
                    sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                    className="audit-embed"
                />
            ) : (
                <div className="audit-embed audit-embed_empty slds-text-align_center">
                    <div className="slds-text-font_monospace slds-text-color_weak">no Lighthouse report</div>
                    <p className="slds-text-body_small slds-text-color_weak audit-prose">
                        This page&apos;s Playhouse archive has no Lighthouse HTML report, so there is nothing to embed.
                    </p>
                </div>
            )}
        </div>
    );
}

function ServerView({ result, page }: { result: AuditResult; page: Page }) {
    const ttfb = metric(page, 'TTFB')?.display ?? '—';
    const traced = pageWaterfall(result, page.label);
    if (traced) {
        return (
            <div className="slds-p-around_medium">
                <ServerWaterfall key={page.label} {...traced} ttfb={ttfb} />
            </div>
        );
    }
    return (
        <div className="slds-p-around_medium audit-stack">
            <MetricStat label="TTFB (measured)" value={ttfb} />
            <Notice>
                <strong>Server request analysis was not supplied for this page.</strong> The{' '}
                <code>{WATERFALL_RULE_ID}</code> rule traces middleware and loader calls from source to show which
                server requests run in parallel and which are chained. TTFB above is the only measured server signal.
            </Notice>
        </div>
    );
}

/** The dashboard server streams the report out of the page's Playhouse archive.
 * The artifact name matches LIGHTHOUSE_REPORT in src/results.ts. */
function reportHref(page: Page): string | undefined {
    if (asObject(page.playhouse.artifacts['report-mobile-cold.html'])?.available !== true) return undefined;
    return forRun(`/api/pages/${encodeURIComponent(page.label)}/report`);
}
