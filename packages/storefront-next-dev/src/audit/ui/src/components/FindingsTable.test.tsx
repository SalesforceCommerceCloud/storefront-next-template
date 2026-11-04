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
import { describe, expect, it } from 'vitest';
import fixture from '../../../__fixtures__/audit-result.json';
import type { AuditResult } from '../types';
import type { Evaluation, Observation } from '../lib/audit';
import { Category } from '../panels/Category';
import { FindingsTable } from './FindingsTable';

const base = fixture as unknown as AuditResult;
const extra: Evaluation[] = [
    {
        ruleId: 'performance/font-display',
        disposition: 'pass',
        title: 'Fonts swap while loading',
        description: 'Every web font sets `font-display`.',
        summary: 'All fonts use swap.',
        method: 'script',
        evidence: ['home', 'plp', 'pdp'].map((page) => ({
            type: 'playhouse',
            page,
            artifact: 'summary.json',
            pointer: '/cells/0',
        })),
    },
    {
        ruleId: 'accessibility/focus-order',
        disposition: 'not-verified',
        title: 'Focus order follows the layout',
        summary: 'The agent could not drive the keyboard.',
        method: 'ai',
        evidence: [],
    },
    {
        ruleId: 'performance/service-worker',
        disposition: 'not-applicable',
        title: 'Service worker caches the shell',
        summary: 'The storefront has no service worker.',
        method: 'ai',
        evidence: [{ type: 'source', file: 'src/entry.client.tsx' }],
    },
];
const observation: Observation = {
    title: 'Hero image is decorative',
    summary: 'Reviewed by hand.',
    evidence: [],
};
const result: AuditResult = {
    ...base,
    evaluations: [...base.evaluations, ...extra],
    observations: [...base.observations, observation],
};

const renderTable = (props: Partial<Parameters<typeof FindingsTable>[0]> = {}) =>
    render(
        <FindingsTable result={result} evaluations={result.evaluations} observations={result.observations} {...props} />
    );

/** Row titles in display order. */
const titles = () =>
    within(screen.getByRole('table'))
        .queryAllByRole('rowheader')
        .map((cell) => within(cell).getByRole('button').getAttribute('title'));

/** Picks an option in one of the table's SLDS picklist filters. */
function choose(filter: string, option: string) {
    fireEvent.click(screen.getByRole('textbox', { name: filter }));
    const match = screen.getAllByRole('option').find((item) => item.textContent?.trim() === option);
    if (!match) throw new Error(`No ${option} option in ${filter}`);
    fireEvent.click(match);
}

const optionsOf = (filter: string) => {
    fireEvent.click(screen.getByRole('textbox', { name: filter }));
    const options = screen.getAllByRole('option');
    const labels = options.map((item) => item.textContent?.replace('Current Selection:', '').trim());
    // Re-picking the current choice closes the menu.
    fireEvent.click(options[0] as HTMLElement);
    return labels;
};

describe('FindingsTable', () => {
    it('lists evaluations and observations by severity, then title', () => {
        renderTable({ heading: 'All findings' });
        expect(screen.getByText('All findings (8)')).toBeTruthy();
        expect(screen.getByText('Showing 8 of 8')).toBeTruthy();
        expect(titles()).toEqual([
            'Server Request Waterfall',
            'Slow product-page LCP',
            'Missing accessible name',
            'Focus order follows the layout',
            'Fonts swap while loading',
            'Hero image is decorative',
            'Manual checkout review',
            'Service worker caches the shell',
        ]);
    });

    it('shows each row’s outcome, category, page and source', () => {
        renderTable();
        const cells = (title: string) =>
            within(screen.getByRole('button', { name: title }).closest('tr') as HTMLElement)
                .getAllByRole('cell')
                .slice(1)
                .map((cell) => cell.textContent);
        expect(cells('Slow product-page LCP')).toEqual([
            'high',
            'Performance',
            'Product / PDP',
            'Product / PDP · LCP breakdown',
        ]);
        expect(cells('Fonts swap while loading')).toEqual([
            'pass',
            'Performance',
            'All pages',
            'Home · Lighthouse summary',
        ]);
        expect(cells('Service worker caches the shell')).toEqual([
            'n/a',
            'Performance',
            'Site-wide',
            'src/entry.client.tsx',
        ]);
        expect(cells('Focus order follows the layout')).toEqual(['not verified', 'Accessibility', 'Site-wide', '—']);
        expect(cells('Hero image is decorative')).toEqual(['observation', 'Cross-category', 'Site-wide', '—']);
    });

    it('offers only the outcomes, categories and pages present in the rows', () => {
        renderTable({ showCategoryFilter: true });
        expect(optionsOf('Outcome')).toEqual([
            'All outcomes',
            'Findings',
            'Not verified',
            'Passed',
            'Not applicable',
            'Observations',
        ]);
        expect(optionsOf('Category')).toEqual(['All categories', 'Performance', 'Accessibility']);
        expect(optionsOf('Page')).toEqual(['Any page', 'Product / PDP', 'Home', 'Category / PLP', 'Site-wide']);
    });

    it('filters by outcome, severity, category and page together', () => {
        renderTable({ showCategoryFilter: true });
        choose('Outcome', 'Findings');
        expect(titles()).toEqual(['Server Request Waterfall', 'Slow product-page LCP', 'Missing accessible name']);
        expect(screen.getByText('Showing 3 of 8')).toBeTruthy();

        choose('Severity', 'High');
        expect(titles()).toEqual(['Server Request Waterfall', 'Slow product-page LCP']);

        choose('Page', 'Product / PDP');
        expect(titles()).toEqual(['Slow product-page LCP']);

        choose('Page', 'Site-wide');
        expect(titles()).toEqual(['Server Request Waterfall']);

        choose('Category', 'Accessibility');
        expect(titles()).toEqual([]);
        expect(screen.getByText('No findings match the current filters.')).toBeTruthy();

        choose('Outcome', 'All outcomes');
        choose('Severity', 'All severities');
        choose('Page', 'Any page');
        expect(titles()).toEqual([
            'Missing accessible name',
            'Focus order follows the layout',
            'Manual checkout review',
        ]);
    });

    it('opens pre-filtered to an outcome', () => {
        renderTable({ initialOutcome: 'not-verified' });
        expect(titles()).toEqual(['Focus order follows the layout']);
    });

    it('leaves out filters with nothing to choose between', () => {
        const findingsOnly = base.evaluations.filter((item) => item.ruleId !== 'performance/lcp-budget');
        const { unmount } = render(
            <FindingsTable result={base} evaluations={findingsOnly} observations={[]} showCategoryFilter />
        );
        expect(screen.queryByRole('textbox', { name: 'Outcome' })).toBeNull();
        expect(screen.getByRole('textbox', { name: 'Category' })).toBeTruthy();
        expect(optionsOf('Page')).toEqual(['Any page', 'Site-wide']);
        unmount();

        render(<FindingsTable result={base} evaluations={[]} observations={[]} showCategoryFilter />);
        expect(screen.getByRole('textbox', { name: 'Severity' })).toBeTruthy();
        expect(screen.queryByRole('textbox', { name: 'Category' })).toBeNull();
        expect(screen.queryByRole('textbox', { name: 'Page' })).toBeNull();
        expect(screen.getByText('No findings match the current filters.')).toBeTruthy();
    });

    it('expands a rule into what it checks, its evidence, fix and provenance', () => {
        renderTable();
        fireEvent.click(screen.getByRole('button', { name: 'Fonts swap while loading' }));
        expect(screen.getByText('What this checks')).toBeTruthy();
        expect(screen.getByText('font-display').tagName).toBe('CODE');
        expect(screen.getByText('All fonts use swap.')).toBeTruthy();
        const details = screen.getByText('Disposition').closest('dl') as HTMLElement;
        expect(within(details).getByText('pass')).toBeTruthy();
        expect(within(details).getByText('performance/font-display')).toBeTruthy();
        expect(within(details).getByText('Deterministic')).toBeTruthy();
        // One citation per page, each labeled by page.
        expect(screen.getByText('Category / PLP · Lighthouse summary')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Collapse details' }));
        expect(screen.queryByText('What this checks')).toBeNull();
    });

    it('shows the fix for a finding and how each row was decided', () => {
        renderTable();
        fireEvent.click(screen.getByRole('button', { name: 'Missing accessible name' }));
        expect(screen.getByText('Recommended fix')).toBeTruthy();
        expect(screen.getByText('Provide a visible label or accessible name.')).toBeTruthy();
        expect(screen.getByText(/<button><Icon \/><\/button>/)).toBeTruthy();
        expect(screen.getByText('AI-evaluated')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Focus order follows the layout' }));
        expect(screen.getByText('Needs manual review')).toBeTruthy();
        expect(screen.getByText('No evidence supplied.')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Manual checkout review' }));
        expect(screen.getByText('Manual')).toBeTruthy();
        expect(
            screen.getByText(
                (_, element) =>
                    element?.tagName === 'PRE' && element.textContent === 'Keyboard walkthrough\ncheckout shipping step'
            )
        ).toBeTruthy();
        expect(screen.getAllByText('Rule')).toHaveLength(2);
    });

    it('marks AI-evaluated rules', () => {
        renderTable();
        const row = screen.getByRole('button', { name: 'Focus order follows the layout' }).closest('th') as HTMLElement;
        expect(within(row).getByText('AI')).toBeTruthy();
    });
});

describe('Category', () => {
    it('summarizes a category and lists only its rows', () => {
        render(<Category result={result} id="accessibility" />);
        expect(screen.getByText('1 codified rule; 1 finding, 1 needs a manual review.')).toBeTruthy();
        expect(titles()).toEqual([
            'Missing accessible name',
            'Focus order follows the layout',
            'Manual checkout review',
        ]);
    });

    it('calls out a category without rules as a coverage gap', () => {
        const withGap: AuditResult = {
            ...result,
            catalog: {
                ...result.catalog,
                categories: [...result.catalog.categories, { id: 'seo', title: 'SEO', ruleIds: [] }],
            },
        };
        render(<Category result={withGap} id="seo" />);
        expect(screen.getByText('No codified rules. This is a visible coverage gap, not a pass.')).toBeTruthy();
        expect(screen.queryByRole('table')).toBeNull();
    });

    it('renders nothing for an unknown category', () => {
        const { container } = render(<Category result={result} id="missing" />);
        expect(container.innerHTML).toBe('');
    });
});
