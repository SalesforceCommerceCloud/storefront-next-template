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
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import log from '../../../__fixtures__/progress/events.ndjson?raw';
import { reduceEvents, type RunningModel } from '../lib/progress';
import { RunningView } from './RunningView';

type Event = Parameters<typeof reduceEvents>[0][number];
const events = log
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Event);
const runComplete = (extra: Record<string, unknown> = {}): Event =>
    ({ type: 'run.complete', scores: [], at: '2026-09-27T16:30:10.000Z', ...extra }) as Event;
const finding = (id: string): Event =>
    ({ type: 'finding', id, severity: 'low', title: `Finding ${id}`, at: '2026-09-27T16:30:06.000Z' }) as Event;

/** The step list item whose title is `title`. */
const step = (title: string) =>
    screen.getByText(title, { selector: '.slds-text-title_bold' }).closest('li') as HTMLElement;

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-27T16:30:30.000Z'));
});
afterEach(() => {
    vi.useRealTimers();
});

describe('RunningView while the audit runs', () => {
    it('shows the run, the active step and how far it has got', () => {
        render(<RunningView model={reduceEvents(events)} />);
        expect(screen.getByText('northwind-outfitters.example')).toBeTruthy();
        expect(screen.getByText('staging-03')).toBeTruthy();
        expect(screen.getByText('a3f91c2')).toBeTruthy();
        expect(screen.getByText('Running', { selector: '.audit-live' })).toBeTruthy();
        expect(screen.queryByText('Open report')).toBeNull();
        expect(screen.getByText('Step 5 of 7')).toBeTruthy();
        expect(screen.getByText('4 of 7 complete')).toBeTruthy();
        // The active step heads the progress card, and the header counts the findings so far.
        expect(screen.getAllByText('Evaluate audit rules')).toHaveLength(2);
        expect(screen.getAllByText('16:30')).toHaveLength(2);
    });

    it('marks each step done, running or pending with its timing and results', () => {
        render(<RunningView model={reduceEvents(events)} />);
        const prep = step('Resolve entry pages');
        expect(within(prep).getByText('Done')).toBeTruthy();
        expect(within(prep).getByText('0m 05s')).toBeTruthy();
        expect(within(prep).getByText('3 entry pages selected')).toBeTruthy();

        const home = step('Lighthouse · Home');
        expect(within(home).getByText('3.4s')).toBeTruthy();
        expect(within(home).getByText('62')).toBeTruthy();

        const rules = step('Evaluate audit rules');
        expect(within(rules).getByText('Running')).toBeTruthy();
        // Running since 16:27:11, 3m 19s ago.
        expect(within(rules).getByText('3:19')).toBeTruthy();
        expect(within(rules).getByText('16/16')).toBeTruthy();
        expect(within(rules).getByText('2 flagged')).toBeTruthy();
        expect(within(rules).getByText('no issues')).toBeTruthy();
        expect(within(rules).getByText('8/14')).toBeTruthy();

        const ai = step('AI code analysis');
        expect(within(ai).getByRole('img', { name: 'Pending' })).toBeTruthy();
    });

    it('feeds the latest findings and activity, newest finding first', () => {
        render(<RunningView model={reduceEvents([...events, finding('f7'), finding('f8')])} />);
        expect(screen.getByText('8 found · showing latest 6')).toBeTruthy();
        const feed = screen.getByText('Latest findings').closest('article') as HTMLElement;
        const titles = within(feed)
            .getAllByRole('listitem')
            .map((item) => item.querySelector('.slds-media__body > div')?.textContent);
        expect(titles).toEqual([
            'Finding f8',
            'Finding f7',
            'Canonical tags missing on filtered PLP URLs',
            'Session cookie missing SameSite and Secure',
            'Content Security Policy header absent',
            'LCP image not preloaded and served unoptimized',
        ]);
        expect(screen.getByText('seo · Crawl')).toBeTruthy();
        expect(screen.getByText('Evaluating SEO rules (14)')).toBeTruthy();
        expect(screen.getByText('live')).toBeTruthy();
    });

    it('ticks the elapsed time every second', () => {
        render(<RunningView model={reduceEvents(events)} />);
        expect(screen.getAllByText('16:30')).toHaveLength(2);
        act(() => {
            vi.advanceTimersByTime(2000);
        });
        expect(screen.getAllByText('16:32')).toHaveLength(2);
    });

    it('says a step is collecting evidence before it has results', () => {
        const homeStarted = events.findIndex((event) => event.type === 'page.start');
        render(<RunningView model={reduceEvents(events.slice(0, homeStarted + 1))} />);
        expect(within(step('Lighthouse · Home')).getByText('Collecting evidence…')).toBeTruthy();
        expect(screen.getByText(/^Nothing flagged yet/)).toBeTruthy();
    });

    it('waits for the plan before a run starts', () => {
        render(<RunningView model={reduceEvents([])} />);
        expect(screen.getByText('storefront')).toBeTruthy();
        expect(screen.getAllByText('Preparing…')).toHaveLength(2);
        expect(screen.getByText('Nothing flagged yet. Findings appear here as each check completes.')).toBeTruthy();
        expect(screen.getAllByText('0:00')).toHaveLength(2);
    });

    it('falls back to a generic title for a target URL it cannot parse', () => {
        const model = reduceEvents(events);
        render(<RunningView model={{ ...model, target: { url: 'not a url' } }} />);
        expect(screen.getByText('storefront')).toBeTruthy();
        expect(screen.queryByText('staging-03')).toBeNull();
    });

    it('warns when the connection to the audit server drops', () => {
        render(<RunningView model={reduceEvents(events)} connectionLost />);
        expect(screen.getByText(/Connection to the audit server lost/)).toBeTruthy();
    });
});

describe('RunningView once the audit ends', () => {
    it('shows the verdict, page scores and a way into the report', () => {
        const onOpenReport = vi.fn();
        const model = reduceEvents([
            ...events,
            runComplete({ guidance: 'no-go', scores: [{ label: 'Home', score: 62 }] }),
        ]);
        render(<RunningView model={model} onOpenReport={onOpenReport} />);
        expect(screen.getByText('Not ready to launch')).toBeTruthy();
        expect(
            screen.getByText('1 critical and 0 major findings open across 1 entry page. Audit finished in 16m 10s.')
        ).toBeTruthy();
        expect(screen.getByText('Complete')).toBeTruthy();
        expect(screen.getByText('7 of 7 complete')).toBeTruthy();
        expect(screen.getByText('finished')).toBeTruthy();
        // The elapsed time stops at completion.
        act(() => {
            vi.advanceTimersByTime(5000);
        });
        expect(screen.getAllByText('16:10')).toHaveLength(1);

        fireEvent.click(screen.getByText('Open report'));
        expect(onOpenReport).toHaveBeenCalledOnce();
    });

    it('scores each Lighthouse step when the run reports no scores', () => {
        render(<RunningView model={reduceEvents([...events, runComplete({ guidance: 'go' })])} />);
        expect(screen.getByText('Ready to launch')).toBeTruthy();
        expect(screen.getByText(/across 3 entry pages/)).toBeTruthy();
        expect(screen.getByText('PLP')).toBeTruthy();
    });

    it('reads a missing or retired guidance value as complete', () => {
        const model = reduceEvents([...events, runComplete()]);
        const { rerender } = render(<RunningView model={model} />);
        expect(screen.getByText('Audit complete', { selector: 'h2.slds-text-heading_medium' })).toBeTruthy();
        rerender(
            <RunningView model={{ ...model, guidance: 'retired' as RunningModel['guidance'], finalScores: [] }} />
        );
        expect(screen.getByText('Audit complete', { selector: 'h2.slds-text-heading_medium' })).toBeTruthy();
        expect(screen.getByText(/findings open\. Audit finished/)).toBeTruthy();
    });

    it('reports a failed run', () => {
        const failed = { type: 'run.error', message: 'Playhouse timed out', at: '2026-09-27T16:31:00.000Z' } as Event;
        const { rerender } = render(<RunningView model={reduceEvents([...events, failed])} />);
        expect(screen.getByText('The audit stopped with an error: Playhouse timed out')).toBeTruthy();
        expect(screen.getByText('Error')).toBeTruthy();
        rerender(<RunningView model={{ ...reduceEvents([...events, failed]), error: undefined }} connectionLost />);
        expect(screen.getByText('The audit stopped with an error.')).toBeTruthy();
        expect(screen.queryByText(/Connection to the audit server lost/)).toBeNull();
    });
});
