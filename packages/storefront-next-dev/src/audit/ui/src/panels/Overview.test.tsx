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
 *
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import fixture from '../../../__fixtures__/audit-result.json';
import type { AuditResult } from '../types';
import type { Evaluation } from '../lib/audit';
import { LaunchReadiness } from '../components/LaunchReadiness';
import { Overview } from './Overview';

const result = fixture as unknown as AuditResult;
const evaluation = (ruleId: string, extra: Partial<Evaluation> = {}): Evaluation => ({
    ruleId,
    disposition: 'finding',
    title: ruleId,
    summary: '',
    evidence: [],
    ...extra,
});
const renderOverview = (value: AuditResult = result) => {
    const onNavigateCategory = vi.fn();
    const onShowManualReview = vi.fn();
    render(<Overview result={value} onNavigateCategory={onNavigateCategory} onShowManualReview={onShowManualReview} />);
    return { onNavigateCategory, onShowManualReview };
};
const card = (heading: string) => screen.getByText(heading, { selector: 'h2 *, h2' }).closest('article') as HTMLElement;

describe('Overview', () => {
    it('scores every core metric on every page against its budget', () => {
        renderOverview();
        const budget = card('Performance budget');
        expect(within(budget).getByText('5 pass · 6 warn · 1 fail')).toBeTruthy();
        const table = within(budget).getByRole('table', { name: 'Performance budget by page' });
        expect(
            within(table)
                .getAllByRole('columnheader')
                .map((cell) => cell.textContent)
        ).toEqual(['Metric', 'Home', 'PLP', 'PDP']);
        const lcp = within(table).getByText('LCP').closest('tr') as HTMLElement;
        expect(
            within(lcp)
                .getAllByRole('cell')
                .map((cell) => cell.textContent)
        ).toEqual(['2.1spass', '4.2sfail', '3.2swarn']);
    });

    it('explains how the budget is scored', () => {
        renderOverview();
        fireEvent.click(screen.getByRole('button', { name: 'How the performance budget is scored' }));
        expect(screen.getByText('How each cell is scored')).toBeTruthy();
        expect(screen.getByText('2.5s – 4.0s')).toBeTruthy();
        expect(screen.getByText('> 1.8s')).toBeTruthy();
    });

    it('shows a tile per entry page', () => {
        renderOverview();
        const pages = screen.getByRole('heading', { name: 'Critical entry pages' }).closest('section') as HTMLElement;
        expect(
            within(pages)
                .getAllByRole('article')
                .map((tile) => tile.querySelector('.slds-text-heading_small')?.textContent)
        ).toEqual(['Home', 'Category / PLP', 'Product / PDP']);
        expect(within(pages).getByText('/products/red-shoe')).toBeTruthy();
    });

    it('opens a category from its tile', () => {
        const { onNavigateCategory } = renderOverview();
        const tiles = screen.getByRole('heading', { name: 'Findings by category' }).closest('section') as HTMLElement;
        const accessibility = within(tiles).getByText('Accessibility').closest('button') as HTMLElement;
        expect(accessibility.textContent).toContain('1 medium');
        expect(accessibility.textContent).toContain('Missing accessible name');
        fireEvent.click(accessibility);
        expect(onNavigateCategory).toHaveBeenCalledWith('accessibility');
        expect(within(tiles).getByText('Performance').closest('button')?.textContent).toContain('2 high');
    });

    it('ranks the fixes by severity with where each comes from', () => {
        renderOverview();
        const rows = within(screen.getByRole('table', { name: 'Ranked fixes' }))
            .getAllByRole('row')
            .slice(1);
        expect(rows.map((row) => row.textContent)).toEqual([
            '1Reduce the measured render-delay subpart and recapture.Product / PDP · LCP breakdownhigh',
            '2Start inventory alongside getProduct, return badges from getProduct with a SCAPI hook, and stream reviews. Keep critical data awaited.src/routes/_app.product.$productId.tsx:196high',
            '3Provide a visible label or accessible name.src/components/Hero.tsx:17medium',
        ]);
    });

    it('falls back to the title, rule id and a review badge when a finding has less', () => {
        renderOverview({ ...result, evaluations: [evaluation('seo/canonical', { title: 'Canonical tags missing' })] });
        const row = within(screen.getByRole('table', { name: 'Ranked fixes' })).getAllByRole('row')[1] as HTMLElement;
        expect(row.textContent).toBe('1Canonical tags missingseo/canonicalreview');
    });

    it('drops the page sections without pages and the ranking without findings', () => {
        const catalog = {
            ...result.catalog,
            categories: [...result.catalog.categories, { id: 'seo', title: 'SEO', ruleIds: [] }],
        };
        renderOverview({ ...result, pages: [], evaluations: [], catalog });
        expect(screen.queryByText('Performance budget')).toBeNull();
        expect(screen.queryByText('Critical entry pages')).toBeNull();
        expect(screen.getByText('No ranked findings.')).toBeTruthy();
        expect(screen.getAllByText('No confirmed findings')).toHaveLength(2);
        expect(screen.getByText('No codified rules — coverage gap')).toBeTruthy();
    });

    it('counts unmeasured budget cells apart', () => {
        const home = result.pages[0] as AuditResult['pages'][number];
        const unmeasured = { ...home, label: 'cart', playhouse: { ...home.playhouse, artifacts: {} } };
        renderOverview({ ...result, pages: [home, unmeasured] });
        expect(screen.getByText('4 pass · 0 fail · 4 n/a')).toBeTruthy();
    });
});

describe('LaunchReadiness', () => {
    const renderVerdict = (value: AuditResult) => {
        const onShowManualReview = vi.fn();
        render(<LaunchReadiness result={value} onShowManualReview={onShowManualReview} />);
        return onShowManualReview;
    };
    const stat = (label: string) => screen.getByText(label).parentElement?.textContent;

    it('gives finalize’s verdict with the counts behind it', () => {
        renderVerdict(result);
        expect(screen.getByRole('status').textContent).toBe(
            'Launch with fixes3 findings to fix before launch; nothing blocks launch.'
        );
        expect(stat('To fix before launch')).toContain('3');
        expect(stat('Manual review')).toContain('nothing to review');
        expect(screen.getByText((result.summary as NonNullable<AuditResult['summary']>).narrative)).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Show full summary' })).toBeNull();
    });

    it('links the rules that need a manual review to All Findings', () => {
        const onShowManualReview = renderVerdict({
            ...result,
            evaluations: [
                ...result.evaluations,
                evaluation('a/b', { disposition: 'not-verified' }),
                evaluation('a/c', { disposition: 'pass' }),
            ],
        });
        expect(stat('Passed')).toContain('1');
        fireEvent.click(screen.getByRole('button', { name: 'View in All Findings' }));
        expect(onShowManualReview).toHaveBeenCalledOnce();
    });

    it('derives the verdict when the result carries none', () => {
        const critical = [
            evaluation('security/csp', { severity: 'critical' }),
            evaluation('seo/x', { severity: 'low' }),
        ];
        const { unmount } = render(
            <LaunchReadiness
                result={{ ...result, summary: undefined, evaluations: critical }}
                onShowManualReview={() => {}}
            />
        );
        expect(screen.getByRole('status').textContent).toBe('Not ready to launch1 critical finding blocks launch.');
        expect(stat('Suggestions')).toContain('1');
        unmount();

        renderVerdict({
            ...result,
            summary: { guidance: 'retired' } as unknown as AuditResult['summary'],
            evaluations: [],
        });
        expect(screen.getByRole('status').textContent).toBe('Ready to launchNo findings need a fix before launch.');
    });

    it('collapses a long summary to its opening sentences', () => {
        const narrative = 'LCP is slow on the PDP. Three calls wait on getProduct. The hero button has no name.';
        renderVerdict({ ...result, summary: { guidance: 'go-with-fixes', narrative, highlights: [] } });
        expect(screen.getByText('LCP is slow on the PDP. Three calls wait on getProduct.')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Show full summary' }));
        expect(screen.getByText(narrative)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
        expect(screen.queryByText(narrative)).toBeNull();
    });

    it('lists the summary highlights under its headline', () => {
        const highlights = ['Fix the PDP LCP.', 'Name the hero button.'];
        renderVerdict({ ...result, summary: { guidance: 'go-with-fixes', narrative: '', highlights } });
        expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(highlights);
        expect(screen.getByText('AI summary')).toBeTruthy();
    });
});
