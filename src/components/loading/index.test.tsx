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
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
// oxlint-disable-next-line import/no-namespace -- vi.spyOn requires namespace import
import * as ReactRouter from 'react-router';
import { createMemoryRouter, RouterProvider } from 'react-router';
import Loading from './index';

const mockNavigationState = { state: 'idle' as string | undefined };

const renderLoading = () => {
    const router = createMemoryRouter([{ path: '/', element: <Loading /> }], { initialEntries: ['/'] });
    return { ...render(<RouterProvider router={router} />), router };
};

describe('Loading', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.spyOn(ReactRouter, 'useNavigation').mockImplementation(() => mockNavigationState as any);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    test('renders nothing when navigation state is idle', () => {
        mockNavigationState.state = 'idle';
        const { container } = renderLoading();
        expect(container.firstChild).toBeNull();
    });

    test('renders nothing when navigation is null', () => {
        vi.spyOn(ReactRouter, 'useNavigation').mockReturnValue(null as any);
        const { container } = renderLoading();
        expect(container.firstChild).toBeNull();
    });

    test('renders nothing when navigation state is undefined', () => {
        mockNavigationState.state = undefined;
        const { container } = renderLoading();
        expect(container.firstChild).toBeNull();
    });

    test('shows loading indicator after 150ms delay when navigation state is not idle', () => {
        mockNavigationState.state = 'loading';
        const { container } = renderLoading();

        // Initially nothing — the 150ms timer hasn't fired yet.
        expect(container.firstChild).toBeNull();

        act(() => {
            vi.advanceTimersByTime(150);
        });

        expect(container.firstChild).not.toBeNull();
    });

    test('does not show loading indicator before 150ms elapses', () => {
        mockNavigationState.state = 'loading';
        const { container } = renderLoading();

        act(() => {
            vi.advanceTimersByTime(149);
        });

        expect(container.firstChild).toBeNull();
    });

    test('hides loading indicator immediately when navigation state changes to idle', () => {
        mockNavigationState.state = 'loading';
        const { rerender, container } = renderLoading();

        act(() => {
            vi.advanceTimersByTime(150);
        });
        expect(container.firstChild).not.toBeNull();

        mockNavigationState.state = 'idle';
        rerender(
            <RouterProvider
                router={createMemoryRouter([{ path: '/', element: <Loading /> }], { initialEntries: ['/'] })}
            />
        );

        expect(container.firstChild).toBeNull();
    });

    test('clears the pending 150ms timeout when navigation returns to idle before it fires', () => {
        const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

        mockNavigationState.state = 'loading';
        const { rerender, container } = renderLoading();

        act(() => {
            vi.advanceTimersByTime(100);
        });

        mockNavigationState.state = 'idle';
        rerender(
            <RouterProvider
                router={createMemoryRouter([{ path: '/', element: <Loading /> }], { initialEntries: ['/'] })}
            />
        );

        // Advance past the original 150ms boundary to verify the timer didn't fire.
        act(() => {
            vi.advanceTimersByTime(100);
        });

        expect(clearTimeoutSpy).toHaveBeenCalled();
        expect(container.firstChild).toBeNull();

        clearTimeoutSpy.mockRestore();
    });

    test('clears timeout on component unmount', () => {
        const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
        mockNavigationState.state = 'loading';
        const { unmount } = renderLoading();

        unmount();

        expect(clearTimeoutSpy).toHaveBeenCalled();
        clearTimeoutSpy.mockRestore();
    });

    test('handles multiple navigation state changes correctly', () => {
        mockNavigationState.state = 'idle';
        const { rerender, container } = renderLoading();
        expect(container.firstChild).toBeNull();

        mockNavigationState.state = 'loading';
        rerender(
            <RouterProvider
                router={createMemoryRouter([{ path: '/', element: <Loading /> }], { initialEntries: ['/'] })}
            />
        );
        act(() => {
            vi.advanceTimersByTime(150);
        });
        expect(container.firstChild).not.toBeNull();

        mockNavigationState.state = 'submitting';
        rerender(
            <RouterProvider
                router={createMemoryRouter([{ path: '/', element: <Loading /> }], { initialEntries: ['/'] })}
            />
        );
        act(() => {
            vi.advanceTimersByTime(150);
        });
        expect(container.firstChild).not.toBeNull();

        mockNavigationState.state = 'idle';
        rerender(
            <RouterProvider
                router={createMemoryRouter([{ path: '/', element: <Loading /> }], { initialEntries: ['/'] })}
            />
        );
        expect(container.firstChild).toBeNull();
    });

    test('renders the expected overlay structure when shown', () => {
        mockNavigationState.state = 'loading';
        const { container } = renderLoading();

        act(() => {
            vi.advanceTimersByTime(150);
        });

        const overlay = container.firstChild as HTMLElement | null;
        expect(overlay).not.toBeNull();
        expect(overlay).toHaveClass('fixed', 'top-0', 'left-0', 'z-50');
        expect(overlay?.querySelector('.animate-spin')).not.toBeNull();
    });

    test('treats empty-string navigation state as non-idle (overlay shows)', () => {
        mockNavigationState.state = '';
        const { container } = renderLoading();

        act(() => {
            vi.advanceTimersByTime(150);
        });

        // '' is non-idle, so the overlay should appear after the delay.
        expect(container.firstChild).not.toBeNull();
    });

    test('treats numeric 0 navigation state as non-idle (overlay shows)', () => {
        (mockNavigationState as any).state = 0;
        const { container } = renderLoading();

        act(() => {
            vi.advanceTimersByTime(150);
        });

        // 0 is non-idle, so the overlay should appear after the delay.
        expect(container.firstChild).not.toBeNull();
    });
});
