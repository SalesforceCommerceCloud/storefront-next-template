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
import { type AuditResult, type Guidance, guidanceFor } from '../types';
import { findings as findingsOf } from '../lib/audit';
import { Button, Card, Icon } from '../lib/slds';
import { toneClass, type Tone } from '../lib/tone';
import { cn } from '../lib/cn';
import { AiBadge } from './AiBadge';
import { MetricStat } from './MetricStat';

// The launch verdict is finalize's guidance, which it derives from the known
// findings: a critical finding blocks launch, a high or medium one needs a fix.
// Rules the audit could not verify are listed beside it and never change it.
interface Verdict {
    label: string;
    tone: Tone;
    icon: 'error' | 'warning' | 'success';
}

const VERDICTS: Record<Guidance, Verdict> = {
    'no-go': { label: 'Not ready to launch', tone: 'critical', icon: 'error' },
    'go-with-fixes': { label: 'Launch with fixes', tone: 'high', icon: 'warning' },
    go: { label: 'Ready to launch', tone: 'pass', icon: 'success' },
};

const FIX_SEVERITIES = new Set(['critical', 'high', 'medium']);
// The collapsed AI summary keeps this many sentences; the rest is one click away.
const SUMMARY_SENTENCES = 2;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** One plain sentence that explains the verdict from the counts behind it. */
function reasonFor(critical: number, toFix: number): string {
    if (critical) return `${plural(critical, 'critical finding blocks', 'critical findings block')} launch.`;
    if (toFix) return `${plural(toFix, 'finding', 'findings')} to fix before launch; nothing blocks launch.`;
    return 'No findings need a fix before launch.';
}

const sentencesOf = (text: string): string[] => text.split(/(?<=[.!?])\s+(?=[A-Z])/);

export function LaunchReadiness({
    result,
    className,
    onShowManualReview,
}: {
    result: AuditResult;
    className?: string;
    /** Opens All Findings filtered to the rules the audit could not verify. */
    onShowManualReview: () => void;
}) {
    const findings = findingsOf(result);
    const critical = findings.filter((item) => item.severity === 'critical').length;
    const toFix = findings.filter((item) => FIX_SEVERITIES.has(item.severity ?? 'info')).length;
    const passed = result.evaluations.filter((item) => item.disposition === 'pass').length;
    const unverified = result.evaluations.filter((item) => item.disposition === 'not-verified');
    // Results written before guidance was derived may carry no summary or a retired value.
    const verdict = VERDICTS[result.summary?.guidance as Guidance] ?? VERDICTS[guidanceFor(result.evaluations)];

    return (
        <Card
            className={className}
            heading="Launch readiness"
            icon={<Icon category="standard" name="approval" size="small" />}
            bodyClassName="slds-card__body_inner audit-stack">
            <div className={cn('audit-verdict', toneClass(verdict.tone))} role="status">
                <Icon category="utility" name={verdict.icon} size="small" />
                <div>
                    <h2 className="slds-text-heading_medium">{verdict.label}</h2>
                    <p className="slds-text-body_regular">{reasonFor(critical, toFix)}</p>
                </div>
            </div>

            <div className="audit-metric-row">
                <MetricStat
                    label="To fix before launch"
                    value={toFix}
                    detail="critical, high or medium"
                    className="audit-metric-row__item"
                />
                <MetricStat
                    label="Suggestions"
                    value={findings.length - toFix}
                    detail="low or info"
                    className="audit-metric-row__item"
                />
                <MetricStat label="Passed" value={passed} detail="rules met" className="audit-metric-row__item" />
                <MetricStat
                    label="Manual review"
                    value={
                        unverified.length ? (
                            <span className="slds-grid slds-grid_vertical-align-center audit-gap_x-small">
                                <Icon
                                    category="utility"
                                    name="warning"
                                    size="x-small"
                                    assistiveText={{ label: 'Needs attention' }}
                                />
                                {unverified.length}
                            </span>
                        ) : (
                            0
                        )
                    }
                    detail={
                        unverified.length ? (
                            <button
                                type="button"
                                className="slds-button_reset slds-text-link"
                                onClick={onShowManualReview}>
                                View in All Findings
                            </button>
                        ) : (
                            'nothing to review'
                        )
                    }
                    className={cn(
                        'audit-metric-row__item',
                        unverified.length && cn('audit-metric-row__item_attention', toneClass('high'))
                    )}
                />
            </div>

            {result.summary?.narrative || result.summary?.highlights?.length ? (
                <Narrative text={result.summary.narrative} highlights={result.summary.highlights ?? []} />
            ) : null}
        </Card>
    );
}

/**
 * The agent's summary: a headline with highlight bullets under it. Results
 * written before highlights existed carry one long paragraph, collapsed to its
 * opening sentences so the counts above stay the headline.
 */
function Narrative({ text, highlights }: { text: string; highlights: string[] }) {
    const [expanded, setExpanded] = useState(false);
    const sentences = sentencesOf(text);
    const long = !highlights.length && sentences.length > SUMMARY_SENTENCES;
    const shown = expanded || !long ? text : sentences.slice(0, SUMMARY_SENTENCES).join(' ');

    return (
        <section className="slds-media" aria-label="AI summary">
            <div className="slds-media__figure">
                <img src="/einstein.png" alt="" width={360} height={549} draggable={false} className="audit-mascot" />
            </div>
            <div className="slds-media__body">
                <AiBadge>AI summary</AiBadge>
                {shown ? <p className="audit-prose slds-text-title_bold slds-m-top_x-small">{shown}</p> : null}
                {highlights.length ? (
                    <ul className="slds-list_dotted audit-prose slds-m-top_x-small">
                        {highlights.map((item) => (
                            <li key={item} className="slds-m-bottom_xx-small">
                                {item}
                            </li>
                        ))}
                    </ul>
                ) : null}
                {long ? (
                    <Button
                        className="slds-m-top_xx-small"
                        variant="base"
                        label={expanded ? 'Show less' : 'Show full summary'}
                        aria-expanded={expanded}
                        onClick={() => setExpanded(!expanded)}
                    />
                ) : null}
            </div>
        </section>
    );
}
