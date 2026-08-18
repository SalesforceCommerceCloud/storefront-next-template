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
import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToggleCard, ToggleCardEdit, type ToggleCardProps, ToggleCardSummary } from '@/components/toggle-card';

function renderCard(props: ToggleCardProps) {
    return render(
        <ToggleCard {...props}>
            <ToggleCardSummary>
                <div>Summary Content</div>
            </ToggleCardSummary>
            <ToggleCardEdit>
                <div>Edit Content</div>
            </ToggleCardEdit>
        </ToggleCard>
    );
}

describe('ToggleCard', () => {
    test('renders title and summary when not editing; shows Edit button', async () => {
        const onEdit = vi.fn();
        renderCard({ id: 'card1', title: 'Card Title', editing: false, onEdit, editLabel: 'Edit' });

        expect(screen.getByText('Card Title')).toBeInTheDocument();
        expect(screen.getByText('Summary Content')).toBeInTheDocument();
        expect(screen.queryByText('Edit Content')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();

        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: /edit/i }));
        expect(onEdit).toHaveBeenCalledTimes(1);
    });

    test('renders edit content and Cancel button when editing and invokes onEditActionClick', async () => {
        const onEditActionClick = vi.fn();
        renderCard({ id: 'card2', title: 'Card Title', editing: true, editAction: 'Cancel', onEditActionClick });

        expect(screen.getByText('Edit Content')).toBeInTheDocument();
        expect(screen.queryByText('Summary Content')).not.toBeInTheDocument();

        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: /cancel/i }));
        expect(onEditActionClick).toHaveBeenCalledTimes(1);
    });

    test('does not focus the title when switching into editing (focus should go to form inputs)', () => {
        const { rerender } = render(
            <ToggleCard id="card3" title="Card Title" editing={false}>
                <ToggleCardSummary>
                    <div>Summary Content</div>
                </ToggleCardSummary>
                <ToggleCardEdit>
                    <div>Edit Content</div>
                </ToggleCardEdit>
            </ToggleCard>
        );

        rerender(
            <ToggleCard id="card3" title="Card Title" editing>
                <ToggleCardSummary>
                    <div>Summary Content</div>
                </ToggleCardSummary>
                <ToggleCardEdit>
                    <div>Edit Content</div>
                </ToggleCardEdit>
            </ToggleCard>
        );

        const titleEl = screen.getByText('Card Title');
        // Title should not have focus - focus should go to form inputs instead
        expect(titleEl).not.toHaveFocus();
    });

    test('returns focus to the title when switching out of editing', async () => {
        const { rerender } = render(
            <ToggleCard id="card7" title="Card Title" editing>
                <ToggleCardSummary>
                    <div>Summary Content</div>
                </ToggleCardSummary>
                <ToggleCardEdit>
                    <div>Edit Content</div>
                </ToggleCardEdit>
            </ToggleCard>
        );

        rerender(
            <ToggleCard id="card7" title="Card Title" editing={false}>
                <ToggleCardSummary>
                    <div>Summary Content</div>
                </ToggleCardSummary>
                <ToggleCardEdit>
                    <div>Edit Content</div>
                </ToggleCardEdit>
            </ToggleCard>
        );

        await waitFor(() => {
            expect(screen.getByText('Card Title')).toHaveFocus();
        });
    });

    test('shows loading overlay when isLoading=true and hides when false', () => {
        const { rerender } = renderCard({ id: 'card4', title: 'Card Title', editing: false, isLoading: true });
        const card = screen.getByTestId('sf-toggle-card-card4');
        expect(card.querySelector('.animate-spin')).toBeTruthy();

        rerender(
            <ToggleCard id="card4" title="Card Title" editing={false} isLoading={false}>
                <ToggleCardSummary>
                    <div>Summary Content</div>
                </ToggleCardSummary>
                <ToggleCardEdit>
                    <div>Edit Content</div>
                </ToggleCardEdit>
            </ToggleCard>
        );
        expect(card.querySelector('.animate-spin')).toBeNull();
    });

    test('shows summary when not editing (single page layout)', () => {
        renderCard({ id: 'card5', title: 'Card Title', editing: false, disabled: true, onEdit: vi.fn() });
        expect(screen.queryByText('Summary Content')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
    });

    test('renders description when provided', () => {
        render(
            <ToggleCard id="card6" title="Card Title" description="Desc" editing={false}>
                <ToggleCardSummary>
                    <div>Summary Content</div>
                </ToggleCardSummary>
                <ToggleCardEdit>
                    <div>Edit Content</div>
                </ToggleCardEdit>
            </ToggleCard>
        );
        expect(screen.getByText('Desc')).toBeInTheDocument();
    });
});
