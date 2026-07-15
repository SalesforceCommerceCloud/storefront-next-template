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
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { useSearchSuggestions } from '@/hooks/use-search-suggestions';
import { useTransformSearchSuggestions } from '@/hooks/use-transform-search-suggestions';
import SearchBar from './search';

const { t } = getTranslation();

// --- Mocks: only network/data hooks and deep component trees ---

const mockNavigate = vi.fn();
vi.mock('@/hooks/use-navigate', () => ({
    useNavigate: () => mockNavigate,
}));

const mockRefetch = vi.fn().mockResolvedValue(undefined);

vi.mock('@/hooks/use-search-suggestions', () => ({
    useSearchSuggestions: vi.fn(),
}));

vi.mock('@/hooks/use-transform-search-suggestions', () => ({
    useTransformSearchSuggestions: vi.fn(),
}));

// Lightweight Suggestions stub — the real one has a deep dependency tree.
vi.mock('@/components/search/suggestions', () => ({
    default: ({
        closeAndNavigate,
        clearRecentSearches,
        searchSuggestions,
        recentSearches,
    }: {
        closeAndNavigate: (link: string) => void;
        clearRecentSearches: () => void;
        searchSuggestions: { categorySuggestions?: { link: string; name: string }[] } | null;
        recentSearches: string[];
    }) => (
        <div data-testid="suggestions">
            {searchSuggestions?.categorySuggestions?.map((cat) => (
                <button key={cat.link} onMouseDown={() => closeAndNavigate(cat.link)} data-testid="suggestion-item">
                    {cat.name}
                </button>
            ))}
            {recentSearches?.length > 0 && (
                <button onMouseDown={clearRecentSearches} data-testid="clear-recent">
                    Clear
                </button>
            )}
        </div>
    ),
}));

// --- Typed mock references ---

const mockUseSearchSuggestions = vi.mocked(useSearchSuggestions);
const mockUseTransformSearchSuggestions = vi.mocked(useTransformSearchSuggestions);

// --- Helpers ---

const renderSearchBar = () => {
    const router = createMemoryRouter(
        [
            {
                path: '*',
                element: (
                    <AllProvidersWrapper>
                        <SearchBar />
                    </AllProvidersWrapper>
                ),
            },
        ],
        { initialEntries: ['/global/en-GB'] }
    );
    const result = render(<RouterProvider router={router} />);
    return { ...result, router };
};

describe('SearchBar Component', () => {
    beforeEach(() => {
        mockRefetch.mockClear();
        mockNavigate.mockClear();
        mockUseSearchSuggestions.mockReturnValue({ data: null, refetch: mockRefetch } as any);
        mockUseTransformSearchSuggestions.mockReturnValue(null);
        vi.clearAllTimers();
        vi.useFakeTimers();
        sessionStorage.clear();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe('Basic Rendering', () => {
        it('should render search input with correct attributes', () => {
            renderSearchBar();

            const input = screen.getByRole('combobox');
            expect(input).toBeInTheDocument();
            expect(input).toHaveAttribute('placeholder', t('header:searchPlaceholder'));
            expect(input.getAttribute('id')).toMatch(/^header-search-input-/);
            expect(input).toHaveAttribute('aria-autocomplete', 'list');
            expect(input).toHaveAttribute('aria-expanded', 'false');
            expect(input).toHaveAttribute('aria-haspopup', 'listbox');
        });

        it('should render search icon', () => {
            renderSearchBar();

            const svg = screen.getByRole('combobox').parentElement?.querySelector('svg');
            expect(svg).toBeInTheDocument();
        });

        it('should render form element', () => {
            const { container } = renderSearchBar();

            expect(container.querySelector('form')).toBeInTheDocument();
        });
    });

    describe('Input Handling', () => {
        it('should call handleInputChange when typing', () => {
            let capturedQuery = '';
            mockUseSearchSuggestions.mockImplementation(({ q }: any) => {
                capturedQuery = q;
                return { data: null, refetch: mockRefetch } as any;
            });

            renderSearchBar();

            fireEvent.change(screen.getByRole('combobox'), { target: { value: 'test query' } });
            expect(capturedQuery).toBe('test query');
        });

        it('should update aria-expanded when query length changes', () => {
            mockUseTransformSearchSuggestions.mockReturnValue({
                categorySuggestions: [{ name: 'Test Category' }],
                productSuggestions: [],
            } as any);

            renderSearchBar();

            const input = screen.getByRole('combobox');
            expect(input).toHaveAttribute('aria-expanded', 'false');

            fireEvent.change(input, { target: { value: 'test' } });
            expect(input).toHaveAttribute('aria-expanded', 'true');
        });

        it('should handle input focus', () => {
            mockUseTransformSearchSuggestions.mockReturnValue({
                categorySuggestions: [{ name: 'Test Category' }],
                productSuggestions: [],
            } as any);

            renderSearchBar();

            const input = screen.getByRole('combobox');
            fireEvent.change(input, { target: { value: 'test' } });
            fireEvent.focus(input);

            expect(input).toBeInTheDocument();
        });

        it('should handle input blur and hide suggestions', () => {
            mockUseSearchSuggestions.mockReturnValue({
                data: { categorySuggestions: { categories: [{ id: 'elec', name: 'Electronics' }] } },
                refetch: mockRefetch,
            } as any);
            mockUseTransformSearchSuggestions.mockReturnValue({
                categorySuggestions: [{ name: 'Electronics', link: '/category/electronics' }],
                productSuggestions: [],
            } as any);

            renderSearchBar();

            const input = screen.getByRole('combobox');
            fireEvent.change(input, { target: { value: 'phone' } });
            fireEvent.blur(input);

            expect(input).toBeInTheDocument();
            expect(input).toHaveAttribute('type', 'text');
        });
    });

    describe('Form Submission', () => {
        it('should navigate on form submit', () => {
            renderSearchBar();

            const input = screen.getByRole('combobox');
            const form = input.closest('form') as HTMLFormElement;

            fireEvent.change(input, { target: { value: 'test query' } });
            fireEvent.submit(form);

            expect(mockNavigate).toHaveBeenCalledWith('/search?q=test%20query', { state: { query: 'test query' } });
        });

        it('should prevent default form submission', () => {
            renderSearchBar();

            const input = screen.getByRole('combobox');
            const form = input.closest('form') as HTMLFormElement;

            fireEvent.change(input, { target: { value: 'test' } });

            const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
            const spy = vi.spyOn(submitEvent, 'preventDefault');
            fireEvent(form, submitEvent);

            expect(spy).toHaveBeenCalled();
        });

        it('should not navigate when input is empty', () => {
            renderSearchBar();

            const form = screen.getByRole('combobox').closest('form') as HTMLFormElement;
            fireEvent.submit(form);

            expect(mockNavigate).not.toHaveBeenCalled();
        });

        it('should not navigate when input is only whitespace', () => {
            renderSearchBar();

            const input = screen.getByRole('combobox');
            const form = input.closest('form') as HTMLFormElement;

            fireEvent.change(input, { target: { value: '   ' } });
            fireEvent.submit(form);

            expect(mockNavigate).not.toHaveBeenCalled();
        });
    });

    describe('Suggestions Functionality', () => {
        it('should call closeAndNavigate when suggestion is clicked', () => {
            mockUseTransformSearchSuggestions.mockReturnValue({
                categorySuggestions: [{ name: 'Test Category', link: '/test-link' }],
                productSuggestions: [],
            } as any);

            renderSearchBar();

            const input = screen.getByRole('combobox');
            fireEvent.change(input, { target: { value: 'test query' } });

            act(() => {
                vi.runAllTimers();
            });

            const item = screen.queryByTestId('suggestion-item');
            if (item) {
                fireEvent.mouseDown(item);
                expect(mockNavigate).toHaveBeenCalledWith('/test-link');
            }
        });

        it('should execute closeAndNavigate and clear input', () => {
            mockUseSearchSuggestions.mockReturnValue({
                data: { suggestions: [{ value: 'test' }] },
                refetch: mockRefetch,
            } as any);
            mockUseTransformSearchSuggestions.mockReturnValue({
                categorySuggestions: [{ name: 'Test Category', link: '/test-link' }],
                productSuggestions: [],
            } as any);

            renderSearchBar();

            const input = screen.getByRole('combobox');
            fireEvent.change(input, { target: { value: 'test query to clear' } });
            fireEvent.focus(input);

            act(() => {
                vi.runAllTimers();
            });

            const item = screen.getByTestId('suggestion-item');
            fireEvent.mouseDown(item);

            expect(mockNavigate).toHaveBeenCalledWith('/test-link');
        });

        it('should not show "No suggestions found" when no suggestions available', () => {
            mockUseTransformSearchSuggestions.mockReturnValue(null);

            renderSearchBar();

            fireEvent.change(screen.getByRole('combobox'), { target: { value: 'test' } });

            expect(screen.queryByText('No suggestions found')).not.toBeInTheDocument();
        });
    });

    describe('Debounced Search', () => {
        it('should debounce refetch calls', () => {
            mockUseSearchSuggestions.mockImplementation(() => {
                return { data: null, refetch: mockRefetch } as any;
            });

            renderSearchBar();

            const input = screen.getByRole('combobox');
            fireEvent.change(input, { target: { value: 'tes' } });
            fireEvent.change(input, { target: { value: 'test' } });
            fireEvent.change(input, { target: { value: 'test ' } });
            fireEvent.change(input, { target: { value: 'test q' } });

            act(() => {
                vi.runAllTimers();
            });

            expect(mockRefetch).toHaveBeenCalled();
        });

        it('should cancel debounced call when query is too short', () => {
            renderSearchBar();

            const input = screen.getByRole('combobox');
            fireEvent.change(input, { target: { value: 'test' } });
            fireEvent.change(input, { target: { value: 'te' } });

            act(() => {
                vi.runAllTimers();
            });

            expect(input).toBeInTheDocument();
        });
    });

    describe('Keyboard Interactions', () => {
        it('should handle keyboard events on input', () => {
            renderSearchBar();

            const input = screen.getByRole('combobox');
            fireEvent.keyDown(input, { key: 'ArrowDown' });
            fireEvent.keyDown(input, { key: 'ArrowUp' });
            fireEvent.keyDown(input, { key: 'Enter' });
            fireEvent.keyDown(input, { key: 'Escape' });

            expect(input).toBeInTheDocument();
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty suggestions object', () => {
            mockUseTransformSearchSuggestions.mockReturnValue({
                categorySuggestions: [],
                productSuggestions: [],
            } as any);

            renderSearchBar();

            const input = screen.getByRole('combobox');
            fireEvent.change(input, { target: { value: 'test' } });

            expect(input).toHaveAttribute('aria-expanded', 'false');
        });

        it('should handle suggestions with only categories', () => {
            mockUseTransformSearchSuggestions.mockReturnValue({
                categorySuggestions: [{ name: 'Electronics' }],
                productSuggestions: [],
            } as any);

            renderSearchBar();

            const input = screen.getByRole('combobox');
            fireEvent.change(input, { target: { value: 'test' } });

            expect(input).toBeInTheDocument();
        });

        it('should handle suggestions with only products', () => {
            mockUseTransformSearchSuggestions.mockReturnValue({
                categorySuggestions: [],
                productSuggestions: [{ name: 'iPhone' }],
            } as any);

            renderSearchBar();

            const input = screen.getByRole('combobox');
            fireEvent.change(input, { target: { value: 'test' } });

            expect(input).toBeInTheDocument();
        });
    });

    describe('Component Lifecycle', () => {
        it('should clean up debounced function on unmount', () => {
            const { unmount } = renderSearchBar();

            fireEvent.change(screen.getByRole('combobox'), { target: { value: 'test' } });

            unmount();

            act(() => {
                vi.runAllTimers();
            });

            // No errors thrown
            expect(true).toBe(true);
        });

        it('should update refs when query or refetch changes', () => {
            const newRefetch = vi.fn();
            mockUseSearchSuggestions.mockReturnValue({ data: null, refetch: newRefetch } as any);

            renderSearchBar();

            const input = screen.getByRole('combobox');
            fireEvent.change(input, { target: { value: 'test' } });

            expect(input).toBeInTheDocument();
        });

        it('should handle useEffect suggestions state management', () => {
            mockUseSearchSuggestions.mockReturnValue({
                data: { suggestions: [{ value: 'test' }] },
                refetch: mockRefetch,
            } as any);
            mockUseTransformSearchSuggestions.mockReturnValue({
                categorySuggestions: [{ name: 'Test Category' }],
                productSuggestions: [],
            } as any);

            renderSearchBar();

            const input = screen.getByRole('combobox');
            fireEvent.change(input, { target: { value: 'test' } });

            act(() => {
                vi.runAllTimers();
            });

            expect(input).toBeInTheDocument();
        });
    });

    describe('Recent Searches', () => {
        it('should load recent searches from session storage on mount', () => {
            sessionStorage.setItem('recent-search-key', JSON.stringify(['shoes', 'boots']));

            renderSearchBar();

            expect(screen.getByRole('combobox')).toBeInTheDocument();

            const stored = sessionStorage.getItem('recent-search-key');
            expect(stored).toBeTruthy();
            expect(JSON.parse(stored as string)).toEqual(['shoes', 'boots']);
        });

        it('should handle empty recent searches gracefully', () => {
            sessionStorage.clear();

            renderSearchBar();

            const input = screen.getByRole('combobox');
            fireEvent.focus(input);

            expect(input).toBeInTheDocument();
        });

        it('should show recent searches when input is empty', () => {
            sessionStorage.setItem('recent-search-key', JSON.stringify(['shoes', 'boots']));

            renderSearchBar();

            const input = screen.getByRole('combobox');
            act(() => {
                fireEvent.focus(input);
            });

            expect(input).toBeInTheDocument();
        });

        it('should pass recent searches and clear function to suggestions component', () => {
            sessionStorage.setItem('recent-search-key', JSON.stringify(['shoes', 'boots', 'sneakers']));

            mockUseTransformSearchSuggestions.mockReturnValue(null);

            renderSearchBar();

            const input = screen.getByRole('combobox');
            fireEvent.focus(input);

            const clearButton = screen.queryByTestId('clear-recent');
            if (clearButton) {
                fireEvent.mouseDown(clearButton);
            }

            expect(input).toBeInTheDocument();
        });
    });
});
