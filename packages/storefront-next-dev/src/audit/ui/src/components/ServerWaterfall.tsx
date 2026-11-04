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
import type { AuditResult, WaterfallStep } from '../types';
import { cn } from '../lib/cn';
import { gridColumn, gridColumns } from '../lib/tone';
import { callouts, depths, longestBlockingChain, requestCount, type PageWaterfall } from '../lib/waterfall';
import { AiBadge } from './AiBadge';
import { MetricStat } from './MetricStat';
import { Notice } from './Notice';

const OPPORTUNITY_LABEL: Record<NonNullable<WaterfallStep['opportunity']>, string> = {
    parallelize: 'Run in parallel',
    'scapi-hook': 'Combine with a SCAPI hook',
    stream: 'Stream instead of awaiting',
};

/** What the AI suggests for a call; a chain without an opportunity is fine as it is. */
const suggestionOf = (step: WaterfallStep): string =>
    step.opportunity ? OPPORTUNITY_LABEL[step.opportunity] : 'No change needed';

const sourceOf = (step: WaterfallStep): string =>
    `${step.source.file}${step.source.line ? `:${step.source.line}` : ''}`;

/** The chart's Source column: file name and line only; the full path is on hover and in the list below. */
const fileOf = (step: WaterfallStep): string => sourceOf(step).split('/').at(-1) ?? '';

/**
 * The AI-traced server request graph for one page, laid out by round trip
 * (how many sequential awaits deep a call sits). There are no per-call timings,
 * so bars share one width; what matters is how far right they land and whether
 * they hold back the shell.
 */
export function ServerWaterfall({
    evaluation,
    waterfall,
    ttfb,
}: {
    evaluation: AuditResult['evaluations'][number];
    waterfall: PageWaterfall;
    ttfb: string;
}) {
    const { steps } = waterfall;
    const depth = depths(steps);
    const columns = Math.max(...depth.values()) + 1;
    const kindOf = new Map(steps.map((step) => [step.id, step.kind]));
    const roundTrips = longestBlockingChain(steps).filter((id) => kindOf.get(id) !== 'render').length;
    const listed = callouts(steps);
    const suggestions = steps.filter((step) => step.opportunity).length;
    // Calls the list below talks about are numbered the same way in the chart.
    const marker = new Map(listed.map((step, index) => [step.id, index + 1]));
    const labelOf = (id: string): string => steps.find((step) => step.id === id)?.label ?? id;

    return (
        <div className="audit-stack">
            <div className="audit-explainer slds-text-body_regular">
                <p className="audit-prose">
                    <strong>How this works.</strong> AI reads your storefront’s source code and traces the server-side
                    calls each page makes while it renders: middleware, loaders and API requests. The chart places each
                    call by round trip. Calls in the same column run in parallel, and each column to the right waits for
                    an earlier call to finish. It shows order, not timing.
                </p>
                <p className="audit-prose slds-m-top_x-small">
                    Every awaited call in a chain adds a full round trip before the server can send the first HTML (the
                    page shell), so fewer sequential round trips usually means a faster response. The aim is to keep
                    blocking chains short: run independent calls in parallel and stream data the page doesn’t need right
                    away. Some chains are necessary, when a call needs an earlier result.
                </p>
            </div>

            <header>
                <h3 className="slds-text-heading_small">Server requests</h3>
                <div className="slds-text-body_small slds-text-font_monospace slds-text-color_weak">
                    {waterfall.route}
                </div>
                <p className="slds-text-body_regular audit-prose slds-m-top_x-small">
                    {waterfall.summary} <AiBadge />
                </p>
            </header>

            {evaluation.disposition === 'not-verified' ? (
                <Notice>
                    <strong>Some call sites could not be traced.</strong> {evaluation.summary}
                </Notice>
            ) : null}

            <div className="audit-metric-row">
                <MetricStat
                    label="TTFB"
                    value={ttfb}
                    detail="measured, mobile cold"
                    className="audit-metric-row__item"
                />
                <MetricStat
                    label="Server calls"
                    value={requestCount(steps)}
                    detail="traced from source"
                    className="audit-metric-row__item"
                />
                <MetricStat
                    label="Round trips before the shell"
                    value={roundTrips}
                    detail="on the longest chain of awaited calls"
                    className="audit-metric-row__item"
                />
                <MetricStat
                    label="Suggestions"
                    value={suggestions}
                    detail="options to consider"
                    className="audit-metric-row__item"
                />
            </div>

            <div>
                <div className="audit-waterfall__toolbar">
                    <span className="slds-text-title">Calls by round trip</span>
                    <Legend />
                </div>
                <div className="audit-waterfall" style={gridColumns(columns)}>
                    <div className="audit-waterfall__row audit-waterfall__head" aria-hidden="true">
                        <span>Call</span>
                        <span>Source</span>
                        <span className="audit-waterfall__track">
                            {Array.from({ length: columns }, (_, index) => (
                                <span key={index}>{index + 1}</span>
                            ))}
                        </span>
                    </div>
                    <ul aria-label="Server calls by round trip">
                        {steps.map((step) => {
                            const number = marker.get(step.id);
                            const state = [
                                `round trip ${(depth.get(step.id) ?? 0) + 1}`,
                                step.kind === 'render' ? 'shell sent' : step.blocking ? 'blocks the shell' : 'streamed',
                                step.conditional ?? '',
                                number ? `call to review ${number}` : '',
                            ].filter(Boolean);
                            return (
                                <li
                                    key={step.id}
                                    className="audit-waterfall__row"
                                    aria-label={`${step.label}: ${state.join(', ')}`}>
                                    <span className="audit-waterfall__call">
                                        <span className="audit-waterfall__name">
                                            <span className="slds-truncate" title={step.label}>
                                                {step.label}
                                            </span>
                                            {number ? <span className="audit-waterfall__marker">{number}</span> : null}
                                        </span>
                                        {step.conditional ? (
                                            <span
                                                className="audit-waterfall__condition slds-truncate"
                                                title={step.conditional}>
                                                {step.conditional}
                                            </span>
                                        ) : null}
                                    </span>
                                    <span className="audit-waterfall__source slds-truncate" title={sourceOf(step)}>
                                        {fileOf(step)}
                                    </span>
                                    <span className="audit-waterfall__track">
                                        <span
                                            className={cn(
                                                'audit-waterfall__bar',
                                                step.kind === 'render'
                                                    ? 'audit-waterfall__bar_shell'
                                                    : !step.blocking && 'audit-waterfall__bar_streamed',
                                                step.opportunity && 'audit-waterfall__bar_suggested'
                                            )}
                                            style={gridColumn((depth.get(step.id) ?? 0) + 1)}
                                        />
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </div>

            {listed.length ? (
                <section aria-labelledby="waterfall-suggestions-heading">
                    <h3 id="waterfall-suggestions-heading" className="slds-text-heading_small">
                        Calls to review
                    </h3>
                    <p className="slds-text-body_small slds-text-color_weak">
                        Chained calls that hold back the shell, and calls with a suggestion. Suggestions are options to
                        consider, not required fixes.
                    </p>
                    <ol className="audit-suggestions">
                        {listed.map((step) => (
                            <li key={step.id} className="audit-suggestions__item">
                                <span className="audit-waterfall__marker">{marker.get(step.id)}</span>
                                <div className="audit-suggestions__body">
                                    <div className="slds-text-body_regular">
                                        <strong>{suggestionOf(step)}</strong>
                                        <span className="slds-text-color_weak"> · </span>
                                        <span className="slds-text-font_monospace">{step.label}</span>
                                    </div>
                                    {step.note ? (
                                        <p className="slds-text-body_regular audit-prose">{step.note}</p>
                                    ) : null}
                                    <div className="slds-text-body_small slds-text-color_weak">
                                        <span className="slds-text-font_monospace">{sourceOf(step)}</span>
                                        {step.after.length ? (
                                            <> · waits on {step.after.map(labelOf).join(', ')}</>
                                        ) : null}
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ol>
                </section>
            ) : null}
        </div>
    );
}

function Legend() {
    const items = [
        { label: 'Blocks the shell', className: '' },
        { label: 'Streamed after the shell', className: 'audit-waterfall__bar_streamed' },
        { label: 'Has a suggestion', className: 'audit-waterfall__bar_suggested' },
        { label: 'Shell sent', className: 'audit-waterfall__bar_shell' },
    ];
    return (
        <ul className="slds-list_horizontal slds-wrap audit-gap_small slds-text-body_small slds-text-color_weak">
            {items.map((item) => (
                <li key={item.label}>
                    <span
                        className={cn('audit-waterfall__bar', 'audit-waterfall__swatch', item.className)}
                        aria-hidden="true"
                    />
                    {item.label}
                </li>
            ))}
        </ul>
    );
}
