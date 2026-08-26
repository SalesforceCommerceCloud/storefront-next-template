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
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SpecTable from '.';
import type { SpecTableContent } from '@/components/html-fragment/types';

const dualView: SpecTableContent = {
    contentType: 'spec-table',
    rows: [
        { label: 'Width', values: { imperial: '84 in', metric: '213 cm' } },
        { label: 'Weight', values: { imperial: '96 lbs', metric: '44 kg' } },
    ],
    views: [
        { id: 'imperial', label: 'Imperial' },
        { id: 'metric', label: 'Metric' },
    ],
    defaultViewId: 'imperial',
    viewSwitchLabel: 'Units',
};

describe('SpecTable', () => {
    test('renders a plain 2-column table with no switch when fewer than two views', () => {
        render(
            <SpecTable
                content={{
                    contentType: 'spec-table',
                    rows: [{ label: 'Frame', values: { default: 'Oak' } }],
                }}
            />
        );
        expect(screen.getByText('Frame')).toBeInTheDocument();
        expect(screen.getByText('Oak')).toBeInTheDocument();
        expect(document.querySelector('[data-slot="spec-table-unit-toggle"]')).not.toBeInTheDocument();
    });

    test('shows a view switch and renders the default view values first', () => {
        render(<SpecTable content={dualView} />);

        // Mutually-exclusive choice ⇒ radiogroup semantics (radios + aria-checked), not toggle buttons.
        expect(screen.getByRole('radiogroup', { name: 'Units' })).toBeInTheDocument();
        expect(screen.getByText('84 in')).toBeInTheDocument();
        expect(screen.getByText('96 lbs')).toBeInTheDocument();
        // Metric values are not shown until toggled.
        expect(screen.queryByText('213 cm')).not.toBeInTheDocument();
        expect(screen.getByRole('radio', { name: 'Imperial' })).toHaveAttribute('aria-checked', 'true');
    });

    test('flips only the value column when the alternate view is selected', async () => {
        const user = userEvent.setup();
        render(<SpecTable content={dualView} />);

        await user.click(screen.getByRole('radio', { name: 'Metric' }));

        // Labels are unchanged; values switch to the metric representation.
        expect(screen.getByText('Width')).toBeInTheDocument();
        expect(screen.getByText('213 cm')).toBeInTheDocument();
        expect(screen.getByText('44 kg')).toBeInTheDocument();
        expect(screen.queryByText('84 in')).not.toBeInTheDocument();
        expect(screen.getByRole('radio', { name: 'Metric' })).toHaveAttribute('aria-checked', 'true');
    });

    test('supports arrow-key navigation between views (roving radiogroup)', async () => {
        const user = userEvent.setup();
        render(<SpecTable content={dualView} />);

        const imperial = screen.getByRole('radio', { name: 'Imperial' });
        imperial.focus();
        await user.keyboard('{ArrowRight}');

        expect(screen.getByRole('radio', { name: 'Metric' })).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByText('213 cm')).toBeInTheDocument();
    });

    test('renders subsection headings for groups and flips only rows with an alternate value', async () => {
        const user = userEvent.setup();
        render(
            <SpecTable
                content={{
                    contentType: 'spec-table',
                    groups: [
                        {
                            heading: 'Dimensions',
                            rows: [{ label: 'Width', values: { imperial: '84 in', metric: '213 cm' } }],
                        },
                        { heading: 'Materials', rows: [{ label: 'Frame', values: { imperial: 'Oak' } }] },
                    ],
                    views: [
                        { id: 'imperial', label: 'Imperial' },
                        { id: 'metric', label: 'Metric' },
                    ],
                    defaultViewId: 'imperial',
                    viewSwitchLabel: 'Units',
                }}
            />
        );

        expect(screen.getByRole('heading', { name: 'Dimensions' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Materials' })).toBeInTheDocument();
        expect(screen.getByText('84 in')).toBeInTheDocument();
        expect(screen.getByText('Oak')).toBeInTheDocument();

        await user.click(screen.getByRole('radio', { name: 'Metric' }));
        // Dimension value flips; the single-value material row stays static.
        expect(screen.getByText('213 cm')).toBeInTheDocument();
        expect(screen.queryByText('84 in')).not.toBeInTheDocument();
        expect(screen.getByText('Oak')).toBeInTheDocument();
    });
});
