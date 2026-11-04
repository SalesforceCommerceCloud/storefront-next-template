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
import type { AuditResult, Severity } from './types';
import { useAudit } from './lib/useAudit';
import { categoryId, findings as findingsOf } from './lib/audit';
import { slug, formatDate } from './lib/format';
import { Alert, Icon, PageHeader, PageHeaderControl, Spinner } from './lib/slds';
import { toneClass } from './lib/tone';
import { cn } from './lib/cn';
import { AppShell, type NavItem } from './components/AppShell';
import { Overview } from './panels/Overview';
import { Performance } from './panels/Performance';
import { Category } from './panels/Category';
import { AllFindings } from './panels/AllFindings';
import { RunningView } from './panels/RunningView';
import { RunPicker } from './components/RunPicker';
import { Notice } from './components/Notice';

// Severities shown as header highlights (info is an internal disposition, not
// a launch-risk level, so it stays out of the header).
// oxlint-disable-next-line react-refresh/only-export-components -- a constant the header components share with App
export const HEADER_SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low'];

export function App() {
    const state = useAudit();
    // After a watched run finishes we hold on the completion hero until the user
    // opens the report; view mode (no live run) drops straight into the dashboard.
    const [reportOpen, setReportOpen] = useState(false);

    if (state.status === 'loading') {
        return (
            <AppShell>
                <Spinner size="medium" variant="brand" assistiveText={{ label: 'Loading audit' }} />
            </AppShell>
        );
    }
    if (state.status === 'error') {
        return (
            <AppShell>
                <Alert
                    variant="error"
                    icon={<Icon category="utility" name="error" />}
                    labels={{ heading: `Failed to load audit: ${state.message}` }}
                />
            </AppShell>
        );
    }
    if (state.status === 'unfinished') {
        return (
            <AppShell>
                <main className="slds-m-top_medium audit-stack">
                    <RunPicker />
                    <Notice>This run did not finish, so it has no report.</Notice>
                </main>
            </AppShell>
        );
    }
    if (state.status === 'running') return <RunningView model={state.model} connectionLost={state.connectionLost} />;
    if (state.status === 'complete' && state.model.hasRun && !reportOpen) {
        return (
            <RunningView
                model={state.model}
                connectionLost={state.connectionLost}
                onOpenReport={() => setReportOpen(true)}
            />
        );
    }
    return <Dashboard result={state.result} />;
}

function sectionIdForCategory(id: string): string {
    return id === 'performance' ? 'performance' : `category-${slug(id)}`;
}

function Dashboard({ result }: { result: AuditResult }) {
    const findings = findingsOf(result);
    const countOf = (severity: Severity) => findings.filter((item) => item.severity === severity).length;
    const countInCategory = (id: string) => findings.filter((item) => categoryId(item) === id).length;
    const otherCategories = result.catalog.categories.filter((category) => category.id !== 'performance');

    const nav: NavItem[] = [
        { id: 'overview', label: 'Overview' },
        { id: 'performance', label: 'Performance', count: countInCategory('performance') },
        ...otherCategories.map((category) => ({
            id: sectionIdForCategory(category.id),
            label: category.title,
            count: countInCategory(category.id),
        })),
        { id: 'all-findings', label: 'All Findings', count: findings.length },
    ];

    const [active, setActive] = useState('overview');
    // Set when another panel deep-links into All Findings with a filter; plain navigation clears it.
    const [allFindingsOutcome, setAllFindingsOutcome] = useState<string>();
    const navigate = (id: string, outcome?: string) => {
        setAllFindingsOutcome(outcome);
        setActive(id);
    };
    const activeCategory = otherCategories.find((category) => sectionIdForCategory(category.id) === active);

    return (
        <AppShell nav={nav} active={active} onNavigate={(id) => navigate(id)}>
            {/* Only the overview gets the audit-wide header; the other tabs open with their own summary and counts. */}
            {active === 'overview' ? (
                <PageHeader
                    variant="record-home"
                    icon={<Icon category="standard" name="dashboard" assistiveText={{ label: 'Audit' }} />}
                    label="Pre-Launch Site Audit"
                    title={result.project.name ?? 'storefront'}
                    onRenderActions={() => (
                        <PageHeaderControl>
                            <RunPicker />
                        </PageHeaderControl>
                    )}
                    details={[
                        { label: 'Generated', content: formatDate(result.run.generatedAt) },
                        { label: 'Tool version', content: `v${result.run.toolVersion}` },
                        ...HEADER_SEVERITIES.map((severity) => ({
                            label: severity.charAt(0).toUpperCase() + severity.slice(1),
                            content: (
                                <span className={cn('audit-highlight', toneClass(severity))}>{countOf(severity)}</span>
                            ),
                        })),
                    ]}
                />
            ) : null}
            <main className={cn(active === 'overview' && 'slds-m-top_medium')}>
                {active === 'overview' ? (
                    <Overview
                        result={result}
                        onNavigateCategory={(id) => navigate(sectionIdForCategory(id))}
                        onShowManualReview={() => navigate('all-findings', 'not-verified')}
                    />
                ) : null}
                {active === 'performance' ? <Performance result={result} /> : null}
                {activeCategory ? <Category result={result} id={activeCategory.id} /> : null}
                {active === 'all-findings' ? (
                    <AllFindings key={allFindingsOutcome} result={result} initialOutcome={allFindingsOutcome} />
                ) : null}
            </main>
        </AppShell>
    );
}
