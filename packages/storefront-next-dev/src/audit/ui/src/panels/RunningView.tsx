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
import { useEffect, useRef, useState } from 'react';
import type { RunningModel, StepVM, FindingVM, LogVM, StepCategory } from '../lib/progress';
import { type Severity } from '../types';
import { Alert, Badge, Card, Icon, PageHeader, PageHeaderControl, ProgressBar, Spinner } from '../lib/slds';
import { share, toneClass, type Tone } from '../lib/tone';
import { cn } from '../lib/cn';
import { AppShell } from '../components/AppShell';
import { ScoreRing } from '../components/ScoreRing';
import { MetricStat } from '../components/MetricStat';
import { SeverityBadge } from '../components/SeverityBadge';

// Header counts mirror the Dashboard (four launch-risk levels); info stays out.
const HEADER_SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low'];

const GUIDANCE: Record<NonNullable<RunningModel['guidance']> | 'unknown', { label: string; tone: Tone }> = {
    'no-go': { label: 'Not ready to launch', tone: 'critical' },
    'go-with-fixes': { label: 'Launch with fixes', tone: 'high' },
    go: { label: 'Ready to launch', tone: 'pass' },
    unknown: { label: 'Audit complete', tone: 'info' },
};

const pad = (n: number) => String(n).padStart(2, '0');
const mmss = (msValue: number) => `${Math.floor(msValue / 60000)}:${pad(Math.floor((msValue % 60000) / 1000))}`;
const longDur = (msValue: number) => `${Math.floor(msValue / 60000)}m ${pad(Math.floor((msValue % 60000) / 1000))}s`;
const clock = (at: string) => new Date(at).toTimeString().slice(0, 8);

function hostOf(url: string | undefined, fallback: string): string {
    if (!url) return fallback;
    try {
        return new URL(url).host || fallback;
    } catch {
        return fallback;
    }
}

/** Live-ticking elapsed time; frozen once the run completes. */
function useElapsed(startedAt: string | undefined, completedAt: string | undefined): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (completedAt || !startedAt) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [startedAt, completedAt]);
    if (!startedAt) return 0;
    const end = completedAt ? new Date(completedAt).getTime() : now;
    return Math.max(0, end - new Date(startedAt).getTime());
}

export function RunningView({
    model,
    onOpenReport,
    connectionLost = false,
}: {
    model: RunningModel;
    onOpenReport?: () => void;
    connectionLost?: boolean;
}) {
    const isDone = model.status === 'complete';
    const total = model.steps.length;
    const failed = model.status === 'error';
    const elapsedMs = useElapsed(model.startedAt, isDone || failed ? model.completedAt : undefined);

    const activityLine = model.steps[model.activeIndex]?.title ?? 'Preparing…';
    const stepCounter = total ? `Step ${Math.min(model.activeIndex + 1, total)} of ${total}` : 'Preparing…';

    return (
        <AppShell
            banner={
                failed ? (
                    <RunErrorBanner message={model.error} />
                ) : connectionLost ? (
                    <ConnectionLostBanner />
                ) : undefined
            }>
            <Header model={model} isDone={isDone} elapsedMs={elapsedMs} onOpenReport={onOpenReport} />

            <main className="slds-m-top_medium audit-stack">
                {/* The completion hero replaces the live progress card once the run ends. */}
                {isDone ? (
                    <CompletionHero model={model} elapsedMs={elapsedMs} />
                ) : (
                    <Card
                        heading={activityLine}
                        icon={<Icon category="standard" name="timeslot" size="small" />}
                        headerActions={<span className="slds-text-body_small slds-text-color_weak">{stepCounter}</span>}
                        bodyClassName="slds-card__body_inner">
                        <ProgressBar
                            value={total ? (model.stepsComplete / total) * 100 : 0}
                            radius="circular"
                            thickness="small"
                            assistiveText={{ progress: 'Audit progress' }}
                        />
                        <div className="slds-grid slds-grid_align-spread slds-wrap audit-gap_small slds-m-top_x-small slds-text-body_small slds-text-color_weak">
                            <span>
                                Elapsed{' '}
                                <span className="slds-text-font_monospace slds-text-color_default">
                                    {mmss(elapsedMs)}
                                </span>
                            </span>
                            <span>This page updates live. You can keep working in your terminal.</span>
                        </div>
                    </Card>
                )}

                <div className="slds-grid slds-wrap slds-gutters_small">
                    <div className="slds-col slds-size_1-of-1 slds-large-size_8-of-12">
                        <Card
                            heading="Audit steps"
                            icon={<Icon category="standard" name="task" size="small" />}
                            headerActions={
                                <span className="slds-text-body_small slds-text-color_weak">
                                    {model.stepsComplete} of {total} complete
                                </span>
                            }>
                            <ul className="slds-has-dividers_top">
                                {model.steps.map((step) => (
                                    <StepRow
                                        key={step.id}
                                        step={step}
                                        elapsedMs={elapsedMs}
                                        startedAtRun={model.startedAt}
                                    />
                                ))}
                            </ul>
                        </Card>
                    </div>
                    <aside className="slds-col slds-size_1-of-1 slds-large-size_4-of-12 audit-stack">
                        <FindingsPanel model={model} />
                        <ActivityLog logs={model.logs} isDone={isDone} />
                    </aside>
                </div>
            </main>
        </AppShell>
    );
}

/** Shown when prepare or finalize fails. A finalize that is fixed and run again picks the run back up. */
function RunErrorBanner({ message }: { message?: string }) {
    return (
        <Alert
            variant="error"
            icon={<Icon category="utility" name="error" />}
            labels={{ heading: `The audit stopped with an error${message ? `: ${message}` : '.'}` }}
            className="audit-banner"
        />
    );
}

/** Shown when the SSE stream to the audit server drops mid-run. The page would
 * otherwise sit frozen with no explanation — often the server is an AI agent's
 * background process in a terminal the user can't see. */
function ConnectionLostBanner() {
    return (
        <Alert
            variant="error"
            icon={<Icon category="utility" name="error" />}
            labels={{
                heading:
                    "Connection to the audit server lost. This page has stopped updating. It will resume automatically if the server comes back — if the audit was running in an AI assistant's terminal, that process may have stopped.",
            }}
            className="audit-banner"
        />
    );
}

function Header({
    model,
    isDone,
    elapsedMs,
    onOpenReport,
}: {
    model: RunningModel;
    isDone: boolean;
    elapsedMs: number;
    onOpenReport?: () => void;
}) {
    const site = hostOf(model.target?.url, 'storefront');
    const details = [
        ...(model.target?.env ? [{ label: 'Env', content: model.target.env }] : []),
        ...(model.target?.commit
            ? [{ label: 'Commit', content: <span className="slds-text-font_monospace">{model.target.commit}</span> }]
            : []),
        ...(model.startedAt ? [{ label: 'Started', content: clock(model.startedAt) }] : []),
        { label: 'Elapsed', content: <span className="slds-text-font_monospace">{mmss(elapsedMs)}</span> },
        ...HEADER_SEVERITIES.map((severity) => ({
            label: `${severity.charAt(0).toUpperCase()}${severity.slice(1)}`,
            content: <span className={cn('audit-highlight', toneClass(severity))}>{model.counts[severity]}</span>,
        })),
    ];

    return (
        <PageHeader
            variant="record-home"
            icon={<Icon category="standard" name="dashboard" assistiveText={{ label: 'Audit' }} />}
            label="Pre-Launch Site Audit"
            title={site}
            details={details}
            onRenderActions={() => (
                <>
                    <PageHeaderControl>
                        <StatusBadge isDone={isDone} error={model.status === 'error'} />
                    </PageHeaderControl>
                    {isDone ? (
                        <PageHeaderControl>
                            <a className="slds-button slds-button_brand" href="#report" onClick={onOpenReport}>
                                Open report
                            </a>
                        </PageHeaderControl>
                    ) : null}
                </>
            )}
        />
    );
}

function StatusBadge({ isDone, error }: { isDone: boolean; error: boolean }) {
    if (error) return <SeverityBadge severity="critical">Error</SeverityBadge>;
    if (isDone) return <SeverityBadge severity="pass">Complete</SeverityBadge>;
    return <Badge className="audit-badge audit-badge_live" content={<span className="audit-live">Running</span>} />;
}

function CompletionHero({ model, elapsedMs }: { model: RunningModel; elapsedMs: number }) {
    // A server older than this bundle can still send a retired guidance value.
    const guidance = GUIDANCE[model.guidance ?? 'unknown'] ?? GUIDANCE.unknown;
    const pageCount = model.finalScores.length;
    const narrative = `${model.counts.critical} critical and ${model.counts.high} major findings open${
        pageCount ? ` across ${pageCount} entry page${pageCount === 1 ? '' : 's'}` : ''
    }. Audit finished in ${longDur(elapsedMs)}.`;

    return (
        <Card
            heading="Audit complete"
            icon={<Icon category="standard" name="approval" size="small" />}
            bodyClassName="slds-card__body_inner">
            <div className="slds-grid slds-wrap slds-grid_vertical-align-center slds-grid_align-spread audit-gap_large">
                <div className="slds-col">
                    <h2 className={cn('slds-text-heading_medium audit-tone-text', toneClass(guidance.tone))}>
                        {guidance.label}
                    </h2>
                    <p className="audit-prose slds-m-top_xx-small">{narrative}</p>
                </div>
                <ul className="slds-grid slds-wrap audit-gap_large">
                    {model.finalScores.map((score) => (
                        <li key={score.label} className="slds-grid slds-grid_vertical-align-center audit-gap_x-small">
                            <ScoreRing score={score.score} />
                            <span className="slds-text-title_bold">{score.label}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </Card>
    );
}

function StepIcon({ state }: { state: StepVM['state'] }) {
    if (state === 'done') {
        return (
            <Icon
                category="utility"
                name="success"
                colorVariant="success"
                size="x-small"
                assistiveText={{ label: 'Done' }}
            />
        );
    }
    if (state === 'running') {
        return (
            <span className="audit-step__spinner">
                <Spinner size="x-small" variant="brand" assistiveText={{ label: 'Running' }} />
            </span>
        );
    }
    return <span className="audit-step__pending" aria-label="Pending" role="img" />;
}

function StepRow({ step, elapsedMs, startedAtRun }: { step: StepVM; elapsedMs: number; startedAtRun?: string }) {
    const running = step.state === 'running';
    const runningMs =
        running && step.startedAt && startedAtRun
            ? elapsedMs - (new Date(step.startedAt).getTime() - new Date(startedAtRun).getTime())
            : 0;
    const time =
        step.state === 'done' && step.durationMs !== undefined
            ? longDur(step.durationMs)
            : running
              ? mmss(Math.max(0, runningMs))
              : '';

    return (
        <li className={cn('slds-item audit-step', running && 'audit-step_active')}>
            <div className="slds-media">
                <div className="slds-media__figure audit-step__icon">
                    <StepIcon state={step.state} />
                </div>
                <div className="slds-media__body">
                    <div className="slds-grid slds-grid_align-spread audit-gap_small">
                        <div>
                            <div
                                className={cn(
                                    'slds-text-title_bold',
                                    step.state === 'pending' && 'slds-text-color_weak'
                                )}>
                                {step.title}
                            </div>
                            {step.detail ? (
                                <div className="slds-text-body_small slds-text-color_weak">{step.detail}</div>
                            ) : null}
                        </div>
                        {time ? (
                            <span
                                className={cn(
                                    'slds-no-flex slds-text-font_monospace slds-text-body_small',
                                    running ? 'slds-text-link' : 'slds-text-color_weak'
                                )}>
                                {time}
                            </span>
                        ) : null}
                    </div>

                    {step.score !== undefined || step.metrics?.length ? <ScorePanel step={step} /> : null}
                    {step.rules ? <CategoryBars rules={step.rules} /> : null}
                    {running && step.score === undefined && !step.rules ? (
                        <p className="slds-text-body_small slds-text-color_weak slds-m-top_x-small">
                            Collecting evidence…
                        </p>
                    ) : null}
                    {step.state === 'done' && step.summary ? (
                        <p className="slds-text-body_small slds-text-color_weak slds-m-top_x-small">{step.summary}</p>
                    ) : null}
                </div>
            </div>
        </li>
    );
}

function ScorePanel({ step }: { step: StepVM }) {
    return (
        <div className="slds-grid slds-grid_vertical-align-center audit-gap_large slds-m-top_small">
            <ScoreRing score={step.score} />
            <div className="audit-metric-row slds-col">
                {(step.metrics ?? []).map((metric) => (
                    <MetricStat
                        key={metric.key}
                        label={metric.key}
                        value={metric.value}
                        ok={!metric.bad}
                        size="small"
                        className="audit-metric-row__item"
                    />
                ))}
            </div>
        </div>
    );
}

function CategoryBars({ rules }: { rules: NonNullable<StepVM['rules']> }) {
    return (
        <ul className="audit-tile-grid audit-tile-grid_compact slds-m-top_small">
            {rules.categories.map((category) => (
                <CategoryBar key={category.name} category={category} />
            ))}
        </ul>
    );
}

function CategoryBar({ category }: { category: StepCategory }) {
    const fraction = category.total ? Math.min(1, category.evaluated / category.total) : 0;
    return (
        <li>
            <div className="slds-grid slds-grid_align-spread audit-gap_x-small slds-text-body_small">
                <span className={cn(fraction > 0 ? 'slds-text-title_bold' : 'slds-text-color_weak')}>
                    {category.name}
                </span>
                <span className="slds-text-font_monospace slds-text-color_weak">
                    {category.evaluated}/{category.total}
                </span>
            </div>
            <div className="audit-meter audit-meter_thin slds-m-vertical_xx-small">
                <div
                    className={cn('audit-meter__fill', toneClass(fraction >= 1 ? 'pass' : 'medium'))}
                    style={share(fraction)}
                />
            </div>
            <div
                className={cn(
                    'slds-text-body_small',
                    category.flagged ? cn('audit-tone-text', toneClass('high')) : 'slds-text-color_weak'
                )}>
                {category.flagged ? `${category.flagged} flagged` : fraction >= 1 ? 'no issues' : ' '}
            </div>
        </li>
    );
}

function FindingsPanel({ model }: { model: RunningModel }) {
    const feed = model.findings.slice(-6).toReversed();
    const total = model.findings.length;
    const caption = total
        ? total > feed.length
            ? `${total} found · showing latest ${feed.length}`
            : `${total} found`
        : '';

    return (
        <Card
            heading="Latest findings"
            icon={<Icon category="standard" name="incident" size="small" />}
            headerActions={<span className="slds-text-body_small slds-text-color_weak">{caption}</span>}
            footer={
                <span className="slds-text-body_small slds-text-color_weak">
                    Preliminary. Severities are confirmed when the report compiles.
                </span>
            }>
            {feed.length === 0 ? (
                <p className="slds-p-horizontal_medium slds-text-color_weak">
                    Nothing flagged yet. Findings appear here as each check completes.
                </p>
            ) : (
                <ul className="slds-has-dividers_top-space">
                    {feed.map((finding) => (
                        <FindingRow key={finding.id} finding={finding} />
                    ))}
                </ul>
            )}
        </Card>
    );
}

function FindingRow({ finding }: { finding: FindingVM }) {
    return (
        <li className="slds-item audit-feed-item">
            <div className="slds-media">
                <div className="slds-media__figure audit-feed-item__severity">
                    <SeverityBadge severity={finding.severity}>{finding.severity}</SeverityBadge>
                </div>
                <div className="slds-media__body">
                    <div>{finding.title}</div>
                    <div className="slds-text-body_small slds-text-color_weak">
                        {[finding.category, finding.source].filter(Boolean).join(' · ')}
                    </div>
                </div>
            </div>
        </li>
    );
}

function ActivityLog({ logs, isDone }: { logs: LogVM[]; isDone: boolean }) {
    // The log only grows, so a line's position in it is a stable key.
    const recent = logs.map((log, position) => ({ ...log, position })).slice(-14);
    const scrollRef = useRef<HTMLDivElement>(null);
    // Keep the newest line in view as entries stream in.
    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [logs]);
    return (
        <Card
            heading="Activity"
            icon={<Icon category="standard" name="logging" size="small" />}
            headerActions={
                <span
                    className={cn(
                        'audit-live slds-text-body_small slds-text-font_monospace',
                        isDone && 'audit-live_done'
                    )}>
                    {isDone ? 'finished' : 'live'}
                </span>
            }>
            <div ref={scrollRef} className="audit-log">
                <ol className="audit-log__list">
                    {recent.map((log) => (
                        <li key={log.position} className="audit-log__line">
                            <span className="audit-log__time">{clock(log.at)}</span>
                            <span className={`audit-log__message audit-log__message_${log.level}`}>{log.message}</span>
                        </li>
                    ))}
                </ol>
            </div>
        </Card>
    );
}
