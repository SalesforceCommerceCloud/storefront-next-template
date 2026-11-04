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
import type { Page } from '../lib/audit';
import { pageWaterfall } from '../lib/waterfall';
import { ServerWaterfall } from '../components/ServerWaterfall';
import { Performance } from './Performance';

const result = fixture as unknown as AuditResult;
const [home, plp] = result.pages as [Page, Page, Page];
const withRuns = (page: Page, runs: number): Page => {
    const summary = page.playhouse.artifacts['summary.json'] as Record<string, unknown>;
    const run = { formFactor: 'mobile', cacheState: 'cold' };
    return {
        ...page,
        playhouse: {
            ...page.playhouse,
            artifacts: { ...page.playhouse.artifacts, 'summary.json': { ...summary, runs: Array(runs).fill(run) } },
        },
    };
};

const diagnostics = () => screen.getByText(/^Diagnostics — /).closest('article') as HTMLElement;
/** SLDS keeps every tab panel mounted and hides the others with a class. */
const shownView = () =>
    screen.getAllByRole('tabpanel').find((panel) => panel.classList.contains('slds-show')) as HTMLElement;
const openView = (name: string) => fireEvent.click(screen.getByRole('tab', { name }));

describe('Performance', () => {
    it('lists the performance findings above the page diagnostics', () => {
        render(<Performance result={result} />);
        expect(screen.getByText('Performance findings (2)')).toBeTruthy();
        expect(screen.getByText('2 codified rules; 2 findings.')).toBeTruthy();
        expect(screen.queryByText('Missing accessible name')).toBeNull();
    });

    it('opens on the first page’s Lighthouse report and switches page from the cards', () => {
        render(<Performance result={result} />);
        expect(screen.getByText('Diagnostics — Home')).toBeTruthy();
        const report = within(diagnostics()).getByRole('link', { name: /Open full report/ });
        expect(report.getAttribute('href')).toBe('/api/pages/home/report');
        expect(screen.getByTitle('Lighthouse report — Home').getAttribute('src')).toBe('/api/pages/home/report');
        expect(within(diagnostics()).getByText(/v13\.0\.0/)).toBeTruthy();

        const cards = screen.getAllByRole('button', { pressed: false });
        fireEvent.click(cards.find((card) => card.textContent?.includes('Product / PDP')) as HTMLElement);
        expect(screen.getByText('Diagnostics — Product / PDP')).toBeTruthy();
        expect(screen.getByRole('button', { pressed: true }).textContent).toContain('Product / PDP');
        expect(within(diagnostics()).getByText('3.2s')).toBeTruthy();
        expect(within(diagnostics()).getByText('target 2.5s')).toBeTruthy();
    });

    it('says how many Lighthouse runs the metrics stand for', () => {
        const { rerender } = render(<Performance result={{ ...result, pages: [withRuns(home, 3)] }} />);
        expect(screen.getByText(/representative of 3 runs/)).toBeTruthy();
        rerender(<Performance result={{ ...result, pages: [withRuns(home, 1)] }} />);
        expect(screen.getByText(/single run/).getAttribute('title')).toBe(
            'Playhouse ran Lighthouse once for this page.'
        );
    });

    it('explains a page without a Lighthouse report', () => {
        const noReport: Page = { ...plp, playhouse: { ...plp.playhouse, artifacts: {} } };
        render(<Performance result={{ ...result, pages: [noReport] }} />);
        expect(screen.getByText('no Lighthouse report')).toBeTruthy();
        expect(screen.queryByRole('link', { name: /Open full report/ })).toBeNull();
    });

    it('shows the traced server requests when the page has them', () => {
        render(<Performance result={result} />);
        openView('Server side rendering');
        expect(screen.getByText(/Server request analysis was not supplied for this page/)).toBeTruthy();
        expect(within(shownView()).getByText('480ms')).toBeTruthy();

        fireEvent.click(screen.getAllByRole('button', { pressed: false })[1] as HTMLElement);
        expect(screen.getByText('src/routes/_app.product.$productId.tsx')).toBeTruthy();
        expect(screen.getByText('Calls to review')).toBeTruthy();
    });

    it('shows the page’s bundle analysis view', () => {
        render(<Performance result={result} />);
        openView('Bundle size');
        expect(screen.getByText(/This run has no bundle analysis/)).toBeTruthy();
    });

    it('says when Lighthouse was not run', () => {
        render(<Performance result={{ ...result, pages: [] }} />);
        expect(screen.getByText('Lighthouse was not run — no page diagnostics are available.')).toBeTruthy();
    });

    it('works without a performance category in the catalog', () => {
        const catalog = {
            ...result.catalog,
            categories: result.catalog.categories.filter((c) => c.id !== 'performance'),
        };
        render(<Performance result={{ ...result, catalog }} />);
        expect(screen.queryByText(/codified rules/)).toBeNull();
        expect(screen.getByText('Performance findings (2)')).toBeTruthy();
    });
});

describe('ServerWaterfall', () => {
    const traced = (label: string) => {
        const value = pageWaterfall(result, label);
        if (!value) throw new Error(`no waterfall for ${label}`);
        return value;
    };
    const rowLabels = () =>
        within(screen.getByRole('list', { name: 'Server calls by round trip' }))
            .getAllByRole('listitem')
            .map((item) => item.getAttribute('aria-label'));

    it('lays calls out by round trip and counts what holds back the shell', () => {
        render(<ServerWaterfall {...traced('pdp')} ttfb="1.1s" />);
        const stat = (label: string) => screen.getByText(label).parentElement?.textContent;
        expect(stat('Server calls')).toContain('9');
        expect(stat('Round trips before the shell')).toContain('5');
        expect(stat('Suggestions')).toContain('3');
        expect(screen.getByText('1.1s')).toBeTruthy();
        expect(rowLabels()).toEqual([
            'sitesConfigMiddleware · DAL read: round trip 1, blocks the shell',
            'auth · SLAS guest login: round trip 2, blocks the shell, only without a valid access token',
            'getCategory(root): round trip 3, streamed',
            'getCategories(children): round trip 4, streamed',
            'shopperProducts.getProduct: round trip 3, blocks the shell',
            'GET /inventory/{id}: round trip 4, blocks the shell, call to review 1',
            'GET /custom/badges: round trip 4, blocks the shell, call to review 2',
            'GET /reviews/{id}: round trip 5, blocks the shell, call to review 3',
            'shopperExperience.getPages(pdp): round trip 4, streamed',
            'Shell render: round trip 6, shell sent',
        ]);
    });

    it('lists the calls to review with their suggestion and what they wait on', () => {
        render(<ServerWaterfall {...traced('pdp')} ttfb="1.1s" />);
        const review = screen.getByRole('heading', { name: 'Calls to review' }).closest('section') as HTMLElement;
        const items = within(review).getAllByRole('listitem');
        expect(items.map((item) => item.querySelector('strong')?.textContent)).toEqual([
            'Run in parallel',
            'Combine with a SCAPI hook',
            'Stream instead of awaiting',
        ]);
        expect(items[0]?.textContent).toContain('waits on shopperProducts.getProduct');
        expect(items[0]?.textContent).toContain('src/routes/_app.product.$productId.tsx:196');
        expect(screen.queryByText('Some call sites could not be traced.')).toBeNull();
    });

    it('keeps a necessary chain in the list with no change suggested', () => {
        render(<ServerWaterfall {...traced('plp')} ttfb="900ms" />);
        expect(screen.getByText('No change needed')).toBeTruthy();
        expect(screen.getByText(/the chain is necessary and should stay awaited/)).toBeTruthy();
    });

    it('flags call sites the AI could not trace and leaves out an empty review list', () => {
        const { evaluation, waterfall } = traced('plp');
        const steps = waterfall.steps.filter((step) => step.id !== 'get-promotions');
        render(
            <ServerWaterfall
                evaluation={{ ...evaluation, disposition: 'not-verified', summary: 'The search loader was not found.' }}
                waterfall={{
                    ...waterfall,
                    steps: steps.map((step) => ({
                        ...step,
                        after: step.after.filter((id) => id !== 'get-promotions'),
                    })),
                }}
                ttfb="900ms"
            />
        );
        expect(screen.getByText('Some call sites could not be traced.')).toBeTruthy();
        expect(screen.getByText('The search loader was not found.')).toBeTruthy();
        expect(screen.queryByText('Calls to review')).toBeNull();
    });
});
