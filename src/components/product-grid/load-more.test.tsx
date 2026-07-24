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
import { describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import LoadMore from './load-more';

describe('LoadMore', () => {
    const baseProps = {
        loadedCount: 24,
        total: 218,
        hasMore: true,
        isLoading: false,
        onLoadMore: vi.fn(),
    };

    test('shows progress and an enabled button when more remain', () => {
        render(<LoadMore {...baseProps} onLoadMore={vi.fn()} />);
        expect(screen.getByText('Showing 24 of 218')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /load more/i })).toBeEnabled();
    });

    test('calls onLoadMore when the button is clicked', () => {
        const onLoadMore = vi.fn();
        render(<LoadMore {...baseProps} onLoadMore={onLoadMore} />);
        fireEvent.click(screen.getByRole('button', { name: /load more/i }));
        expect(onLoadMore).toHaveBeenCalledTimes(1);
    });

    test('disables the button and shows a loading label while loading', () => {
        render(<LoadMore {...baseProps} isLoading onLoadMore={vi.fn()} />);
        const button = screen.getByRole('button');
        expect(button).toBeDisabled();
        expect(button).toHaveTextContent(/loading/i);
    });

    test('renders an error alert and a retry button on error', () => {
        render(<LoadMore {...baseProps} hasError onLoadMore={vi.fn()} />);
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /try again/i })).toBeEnabled();
    });

    test('shows the end-of-catalog message (no button) once everything is loaded', () => {
        render(<LoadMore loadedCount={218} total={218} hasMore={false} isLoading={false} onLoadMore={vi.fn()} />);
        expect(screen.getByText(/reached the end/i)).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    test('shows the refine-filters prompt (no button) when the DOM cap is reached', () => {
        render(
            <LoadMore loadedCount={200} total={553} hasMore={false} capReached isLoading={false} onLoadMore={vi.fn()} />
        );
        expect(screen.getByText(/refine your filters/i)).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    test('renders nothing when there are no products', () => {
        const { container } = render(
            <LoadMore loadedCount={0} total={0} hasMore={false} isLoading={false} onLoadMore={vi.fn()} />
        );
        expect(container).toBeEmptyDOMElement();
    });

    test('still renders while a request is in flight even if hasMore has settled false', () => {
        render(<LoadMore {...baseProps} hasMore={false} isLoading onLoadMore={vi.fn()} />);
        expect(screen.getByRole('button')).toBeInTheDocument();
    });

    test('renders the infinite-scroll sentinel only when more remain', () => {
        const { container, rerender } = render(<LoadMore {...baseProps} sentinelRef={vi.fn()} onLoadMore={vi.fn()} />);
        // The sentinel is the aria-hidden element inside the control.
        expect(container.querySelector('[data-slot="load-more"] [aria-hidden="true"].h-px')).toBeInTheDocument();

        rerender(<LoadMore {...baseProps} hasMore={false} isLoading sentinelRef={vi.fn()} onLoadMore={vi.fn()} />);
        expect(container.querySelector('.h-px')).not.toBeInTheDocument();
    });
});
