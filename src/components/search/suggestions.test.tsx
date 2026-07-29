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
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import SearchSuggestionsSection from './suggestions-section';

const { t } = getTranslation();

// Mock child components
vi.mock('./suggestions-list', () => ({
    default: ({ suggestions, closeAndNavigate }: any) => (
        <div data-testid="suggestions-list">
            {suggestions?.map((suggestion: any) => (
                <button
                    key={suggestion.link || suggestion.name}
                    onMouseDown={() => closeAndNavigate?.(suggestion.link)}
                    data-testid="suggestion-item">
                    {suggestion.name}
                </button>
            ))}
        </div>
    ),
}));

vi.mock('./suggestions-grid', () => ({
    default: ({ suggestions, closeAndNavigate }: any) => (
        <div data-testid="suggestions-grid">
            {suggestions?.map((suggestion: any) => (
                <button
                    key={suggestion.link || suggestion.name}
                    onMouseDown={() => closeAndNavigate?.(suggestion.link)}
                    data-testid="grid-item">
                    {suggestion.name}
                </button>
            ))}
        </div>
    ),
}));

// Mock URL builder. `encodeBase64Url` is preserved so that downstream consumers
// still get a real implementation without each test having to stub it.
vi.mock('@/lib/url', async () => {
    const actual = await vi.importActual<typeof import('@/lib/url')>('@/lib/url');
    return {
        ...actual,
        searchUrlBuilder: vi.fn((phrase: string) => `/search?q=${encodeURIComponent(phrase)}`),
    };
});

vi.mock('@/hooks/use-analytics', () => ({
    useAnalytics: () => ({
        trackViewSearchSuggestions: vi.fn(),
        trackClickSearchSuggestion: vi.fn(),
    }),
}));

const renderWithRouter = (ui: React.ReactElement) => {
    const router = createMemoryRouter([{ path: '*', element: <AllProvidersWrapper>{ui}</AllProvidersWrapper> }], {
        initialEntries: ['/'],
    });
    return render(<RouterProvider router={router} />);
};

describe('SearchSuggestionsSection Component', () => {
    const mockCloseAndNavigate = vi.fn();
    const mockClearRecentSearches = vi.fn();

    beforeEach(() => {
        mockCloseAndNavigate.mockClear();
        mockClearRecentSearches.mockClear();
    });

    const mockSearchSuggestions = {
        searchPhrase: 'test search',
        categorySuggestions: [
            {
                name: 'Electronics',
                link: '/category/electronics',
                type: 'category',
            },
            {
                name: 'Phones',
                link: '/category/phones',
                type: 'category',
            },
        ],
        productSuggestions: [
            {
                name: 'iPhone 15',
                link: '/product/iphone-15',
                type: 'product',
                image: 'https://example.com/iphone.jpg',
                price: 999,
            },
            {
                name: 'Samsung Galaxy',
                link: '/product/samsung-galaxy',
                type: 'product',
                price: 799,
            },
        ],
        phraseSuggestions: [
            {
                name: 'test search corrected',
                link: '/search?q=test%20search%20corrected',
                type: 'phrase',
                exactMatch: false,
            },
        ],
    };

    describe('Basic Rendering', () => {
        it('should render without crashing with empty suggestions', () => {
            const emptySuggestions = {};

            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={emptySuggestions}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            expect(screen.queryByText(/Categories|Products/i)).not.toBeInTheDocument();
        });

        it('should render with complete search suggestions', () => {
            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={mockSearchSuggestions}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            // Mobile: 2 lists (categories + products), Desktop: 1 list (categories) = 3 total
            expect(screen.getAllByTestId('suggestions-list')).toHaveLength(3);
            expect(screen.getByTestId('suggestions-grid')).toBeInTheDocument();
        });

        it('should render all suggestion sections', () => {
            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={mockSearchSuggestions}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            expect(screen.getAllByText('Categories').length).toBeGreaterThan(0);
            expect(screen.getAllByTestId('suggestions-list').length).toBeGreaterThan(0);
            expect(screen.getByTestId('suggestions-grid')).toBeInTheDocument();
        });
    });

    describe('Mobile Layout', () => {
        it('should render mobile layout with correct structure', () => {
            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={mockSearchSuggestions}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            const mobileContainer = screen.getAllByText('Categories')[0].closest('.block.md\\:hidden');
            expect(mobileContainer).toBeInTheDocument();
        });

        it('should show "Did you mean" suggestion for mobile when exactMatch is false', () => {
            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={mockSearchSuggestions}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            const didYouMeanTexts = screen.getAllByText(/Did you mean/);
            expect(didYouMeanTexts).toHaveLength(2); // One for mobile, one for desktop

            const correctedLinks = screen.getAllByText('test search corrected?');
            expect(correctedLinks).toHaveLength(2); // One for mobile, one for desktop
        });

        it('should render categories section in mobile and desktop layout', () => {
            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={mockSearchSuggestions}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            // Categories shown in both mobile and desktop layouts
            const categoriesHeaders = screen.getAllByText('Categories');
            expect(categoriesHeaders).toHaveLength(2);
        });

        it('should render products section in mobile layout', () => {
            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={mockSearchSuggestions}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            const productsHeaders = screen.getAllByText('Products');
            expect(productsHeaders).toHaveLength(1); // Only in mobile layout
        });
    });

    describe('Desktop Layout', () => {
        it('should render desktop layout with correct structure', () => {
            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={mockSearchSuggestions}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            const desktopContainer = screen.getByText('View All').closest('.hidden.md\\:flex');
            expect(desktopContainer).toBeInTheDocument();
        });

        it('should render View All link in desktop layout', () => {
            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={mockSearchSuggestions}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            const viewAllLink = screen.getByText('View All');
            // React Router Link component shows href as "/" in testing environment
            expect(viewAllLink).toBeInTheDocument();
        });

        it('should use proper React Router Link props (to instead of href)', () => {
            // Test that the fix for href -> to conversion is working
            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={{
                        ...mockSearchSuggestions,
                        phraseSuggestions: [
                            {
                                name: 'corrected search',
                                link: '/search?q=corrected',
                                type: 'phrase',
                                exactMatch: false,
                            },
                        ],
                    }}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            const viewAllLink = screen.getByText('View All');
            const didYouMeanLinks = screen.getAllByText('corrected search?');

            // Both should be rendered as proper anchor elements (React Router Link)
            expect(viewAllLink.tagName).toBe('A');
            expect(didYouMeanLinks.length).toBe(2); // Mobile and desktop versions
            didYouMeanLinks.forEach((link) => {
                expect(link.tagName).toBe('A');
            });

            // Should be clickable (React Router handles navigation)
            expect(viewAllLink).toBeInTheDocument();
            didYouMeanLinks.forEach((link) => {
                expect(link).toBeInTheDocument();
            });
        });

        it('should render suggestions grid in desktop layout', () => {
            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={mockSearchSuggestions}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            expect(screen.getByTestId('suggestions-grid')).toBeInTheDocument();
        });
    });

    describe('Conditional Rendering', () => {
        it('should not render categories section when no categories', () => {
            const suggestionsWithoutCategories = {
                ...mockSearchSuggestions,
                categorySuggestions: [],
            };

            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={suggestionsWithoutCategories}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            expect(screen.queryByText('Categories')).not.toBeInTheDocument();
        });

        it('should not render "0" when categories array is empty (Boolean conversion fix)', () => {
            const suggestionsWithEmptyArrays = {
                categorySuggestions: [], // Empty array - length is 0
                productSuggestions: [{ name: 'Test Product', link: '/product/test', type: 'product', price: 10 }],
                phraseSuggestions: [],
                searchPhrase: 'test',
            };

            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={suggestionsWithEmptyArrays}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            // Should not render the number "0" anywhere in the component
            expect(screen.queryByText('0')).not.toBeInTheDocument();
            // Should still render products (appears in both mobile and desktop)
            expect(screen.getAllByText('Test Product').length).toBeGreaterThan(0);
        });

        it('should not render products section when no products', () => {
            const suggestionsWithoutProducts = {
                ...mockSearchSuggestions,
                productSuggestions: [],
            };

            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={suggestionsWithoutProducts}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            expect(screen.queryByText('Products')).not.toBeInTheDocument();
            expect(screen.queryByTestId('suggestions-grid')).not.toBeInTheDocument();
            expect(screen.queryByText('View All')).not.toBeInTheDocument();
        });

        it('should not render "Did you mean" when exactMatch is true', () => {
            const suggestionsWithExactMatch = {
                ...mockSearchSuggestions,
                phraseSuggestions: [
                    {
                        name: 'exact search',
                        link: '/search?q=exact%20search',
                        type: 'phrase',
                        exactMatch: true,
                    },
                ],
            };

            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={suggestionsWithExactMatch}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            expect(screen.queryByText(/Did you mean/)).not.toBeInTheDocument();
        });

        it('should not render "Did you mean" when no phrase suggestions', () => {
            const suggestionsWithoutPhrases = {
                ...mockSearchSuggestions,
                phraseSuggestions: [],
            };

            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={suggestionsWithoutPhrases}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            expect(screen.queryByText(/Did you mean/)).not.toBeInTheDocument();
        });
    });

    describe('Click Interactions', () => {
        it('should call closeAndNavigate when "Did you mean" link is clicked', () => {
            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={mockSearchSuggestions}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            const correctedLinks = screen.getAllByText('test search corrected?');
            fireEvent.mouseDown(correctedLinks[0]); // Click the first one (mobile)

            expect(mockCloseAndNavigate).toHaveBeenCalledWith('/search?q=test%20search%20corrected');
        });

        it('should call closeAndNavigate when View All link is clicked', () => {
            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={mockSearchSuggestions}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            const viewAllLink = screen.getByText('View All');
            fireEvent.mouseDown(viewAllLink);

            expect(mockCloseAndNavigate).toHaveBeenCalledWith('/search?q=test%20search');
        });

        it('should propagate closeAndNavigate to child components', () => {
            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={mockSearchSuggestions}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            // Click on a category suggestion (through mocked component)
            const suggestionItems = screen.getAllByTestId('suggestion-item');
            fireEvent.mouseDown(suggestionItems[0]);

            expect(mockCloseAndNavigate).toHaveBeenCalled();
        });

        it('should propagate closeAndNavigate to suggestions grid', () => {
            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={mockSearchSuggestions}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            // Click on a product suggestion (through mocked grid component)
            const gridItems = screen.getAllByTestId('grid-item');
            fireEvent.mouseDown(gridItems[0]);

            expect(mockCloseAndNavigate).toHaveBeenCalled();
        });
    });

    describe('Props and Configuration', () => {
        it('should handle missing searchPhrase gracefully', () => {
            const suggestionsWithoutPhrase = {
                ...mockSearchSuggestions,
                searchPhrase: undefined,
            };

            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={suggestionsWithoutPhrase}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            const viewAllLink = screen.getByText('View All');
            // React Router Link component shows href as "/" in testing environment
            expect(viewAllLink).toBeInTheDocument();
        });
    });

    describe('Edge Cases', () => {
        it('should handle undefined suggestions arrays', () => {
            const suggestionsWithUndefined = {
                searchPhrase: 'test',
                categorySuggestions: undefined,
                productSuggestions: undefined,
                phraseSuggestions: undefined,
            };

            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={suggestionsWithUndefined}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            expect(screen.queryByText('Categories')).not.toBeInTheDocument();
            expect(screen.queryByText('Products')).not.toBeInTheDocument();
            expect(screen.queryByText(/Did you mean/)).not.toBeInTheDocument();
        });

        it('should handle empty string searchPhrase', () => {
            const suggestionsWithEmptyPhrase = {
                ...mockSearchSuggestions,
                searchPhrase: '',
            };

            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={suggestionsWithEmptyPhrase}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            const viewAllLink = screen.getByText('View All');
            // React Router Link component shows href as "/" in testing environment
            expect(viewAllLink).toBeInTheDocument();
        });

        it('should handle malformed phrase suggestions', () => {
            const suggestionsWithMalformedPhrase = {
                ...mockSearchSuggestions,
                phraseSuggestions: [
                    {
                        name: '',
                        link: '',
                        type: 'phrase',
                        exactMatch: false,
                    },
                ],
            };

            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={suggestionsWithMalformedPhrase}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            // Should still render "Did you mean" section but with empty content
            expect(screen.getAllByText(/Did you mean/)).toHaveLength(2);
        });
    });

    describe('Responsive Layout Classes', () => {
        it('should have correct responsive classes for mobile layout', () => {
            const { container } = renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={mockSearchSuggestions}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            const mobileContainer = container.querySelector('.block.md\\:hidden');
            expect(mobileContainer).toBeInTheDocument();
        });

        it('should have correct responsive classes for desktop layout', () => {
            const { container } = renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={mockSearchSuggestions}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            const desktopContainer = container.querySelector('.hidden.md\\:flex');
            expect(desktopContainer).toBeInTheDocument();
        });

        it('should apply correct flex classes to desktop layout sections', () => {
            const { container } = renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={mockSearchSuggestions}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            const leftSection = container.querySelector('.flex-1');
            const middleSection = container.querySelector('.flex-\\[3\\]');
            const rightSection = container.querySelector('.flex-1.flex.items-center');

            expect(leftSection).toBeInTheDocument();
            expect(middleSection).toBeInTheDocument();
            expect(rightSection).toBeInTheDocument();
        });
    });

    describe('Arrow Function Coverage', () => {
        it('should execute the mobile "Did you mean" link click handler', () => {
            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={mockSearchSuggestions}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            // Find the mobile "Did you mean" link
            const didYouMeanLinks = screen.getAllByText(/test search corrected/);
            const mobileLink = didYouMeanLinks[0]; // First one is mobile

            fireEvent.mouseDown(mobileLink);

            expect(mockCloseAndNavigate).toHaveBeenCalledWith('/search?q=test%20search%20corrected');
        });

        it('should execute the desktop "Did you mean" link click handler', () => {
            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={mockSearchSuggestions}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            // Find the desktop "Did you mean" link
            const didYouMeanLinks = screen.getAllByText(/test search corrected/);
            const desktopLink = didYouMeanLinks[1]; // Second one is desktop

            fireEvent.mouseDown(desktopLink);

            expect(mockCloseAndNavigate).toHaveBeenCalledWith('/search?q=test%20search%20corrected');
        });

        it('should execute the "View All" link click handler', () => {
            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={mockSearchSuggestions}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            const viewAllLink = screen.getByText('View All');

            fireEvent.mouseDown(viewAllLink);

            expect(mockCloseAndNavigate).toHaveBeenCalledWith('/search?q=test%20search');
        });

        it('should execute "View All" with empty searchPhrase', () => {
            const suggestionsWithEmptyPhrase = {
                ...mockSearchSuggestions,
                searchPhrase: '',
            };

            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={suggestionsWithEmptyPhrase}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            const viewAllLink = screen.getByText('View All');

            fireEvent.mouseDown(viewAllLink);

            expect(mockCloseAndNavigate).toHaveBeenCalledWith('/search?q=');
        });

        it('should execute "View All" with undefined searchPhrase', () => {
            const suggestionsWithUndefinedPhrase = {
                ...mockSearchSuggestions,
                searchPhrase: undefined,
            };

            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={suggestionsWithUndefinedPhrase}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            const viewAllLink = screen.getByText('View All');

            fireEvent.mouseDown(viewAllLink);

            expect(mockCloseAndNavigate).toHaveBeenCalledWith('/search?q=');
        });

        it('should handle completely null/undefined searchSuggestions', () => {
            renderWithRouter(
                <SearchSuggestionsSection searchSuggestions={null as any} closeAndNavigate={mockCloseAndNavigate} />
            );

            // Should not crash - component should handle null gracefully
            expect(document.body).toBeInTheDocument();
        });

        it('should handle suggestions with mixed empty and populated arrays', () => {
            const mixedSuggestions = {
                categorySuggestions: [], // Empty
                productSuggestions: [{ name: 'Test Product', link: '/product/test', type: 'product', price: 10 }], // Has content
                phraseSuggestions: [], // Empty
                searchPhrase: 'test',
            };

            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={mixedSuggestions}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            // Should only render products, not categories or phrases
            expect(screen.queryByText('Categories')).not.toBeInTheDocument();
            expect(screen.getAllByText('Test Product').length).toBeGreaterThan(0);
            expect(screen.queryByText(/Did you mean/)).not.toBeInTheDocument();
        });

        it('should handle phrase suggestions with exactMatch true', () => {
            const exactMatchSuggestions = {
                ...mockSearchSuggestions,
                phraseSuggestions: [
                    {
                        name: 'exact match',
                        link: '/search?q=exact',
                        type: 'phrase',
                        exactMatch: true, // This should prevent "Did you mean" from showing
                    },
                ],
            };

            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={exactMatchSuggestions}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            // Should NOT render "Did you mean" when exactMatch is true
            expect(screen.queryByText(/Did you mean/)).not.toBeInTheDocument();
        });

        it('should handle Boolean conversion for all array types', () => {
            // Test the specific Boolean() calls that were added to fix the "0" display bug
            const testCases = [
                // Empty arrays (length = 0, should be falsy)
                {
                    categorySuggestions: [],
                    productSuggestions: [],
                    phraseSuggestions: [],
                    searchPhrase: 'test',
                },
                // Arrays with content (length > 0, should be truthy)
                {
                    categorySuggestions: [{ name: 'Cat', link: '/cat', type: 'category' }],
                    productSuggestions: [{ name: 'Prod', link: '/prod', type: 'product', price: 10 }],
                    phraseSuggestions: [{ name: 'Phrase', link: '/phrase', type: 'phrase', exactMatch: false }],
                    searchPhrase: 'test',
                },
            ];

            testCases.forEach((suggestions) => {
                const { container } = renderWithRouter(
                    <SearchSuggestionsSection searchSuggestions={suggestions} closeAndNavigate={mockCloseAndNavigate} />
                );

                // Should never render the number "0" anywhere
                expect(container.textContent).not.toContain('0');
            });
        });

        it('should cover all conditional branches in phrase suggestions display', () => {
            // Test phrase suggestions with exactMatch false to ensure "Did you mean" shows
            const nonExactMatchSuggestions = {
                searchPhrase: 'misspelled',
                categorySuggestions: [],
                productSuggestions: [],
                phraseSuggestions: [
                    {
                        name: 'corrected spelling',
                        link: '/search?q=corrected%20spelling',
                        type: 'phrase',
                        exactMatch: false, // This should show "Did you mean"
                    },
                ],
            };

            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={nonExactMatchSuggestions}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            // Should render "Did you mean" when exactMatch is false
            expect(screen.getAllByText(/Did you mean/)).toHaveLength(2); // Mobile and desktop
            expect(screen.getAllByText('corrected spelling?')).toHaveLength(2);
        });

        it('should test all navigation callback scenarios', () => {
            const mockCallback = vi.fn();

            renderWithRouter(
                <SearchSuggestionsSection searchSuggestions={mockSearchSuggestions} closeAndNavigate={mockCallback} />
            );

            // Test clicking "View All" link
            const viewAllLink = screen.getByText('View All');
            fireEvent.mouseDown(viewAllLink);
            expect(mockCallback).toHaveBeenCalledWith('/search?q=test%20search');

            // Test clicking phrase suggestion
            const phraseLinks = screen.getAllByText('test search corrected?');
            fireEvent.mouseDown(phraseLinks[0]);
            expect(mockCallback).toHaveBeenCalledWith('/search?q=test%20search%20corrected');

            // Verify callback was called the correct number of times
            expect(mockCallback).toHaveBeenCalledTimes(2);
        });

        it('should handle edge case with null searchPhrase in URL building', () => {
            const suggestionsWithNullPhrase = {
                ...mockSearchSuggestions,
                searchPhrase: undefined,
            };

            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={suggestionsWithNullPhrase}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            const viewAllLink = screen.getByText('View All');
            fireEvent.mouseDown(viewAllLink);

            // Should handle null searchPhrase gracefully
            expect(mockCloseAndNavigate).toHaveBeenCalledWith('/search?q=');
        });
    });

    describe('Einstein Suggestions', () => {
        const mockEinsteinSuggestions = {
            categorySuggestions: [{ name: 'Category 1', link: '/category/1', type: 'category' }],
            productSuggestions: [
                { name: 'Product 1', link: '/product/1', type: 'product', image: 'image1.jpg', price: 100 },
            ],
            phraseSuggestions: [
                { name: 'test search', link: '/search?q=test%20search', type: 'phrase', exactMatch: true },
            ],
            popularSearchSuggestions: [
                { name: 'Popular 1', link: '/search?q=popular%201', type: 'popular', exactMatch: false },
                { name: 'Popular 2', link: '/search?q=popular%202', type: 'popular', exactMatch: false },
            ],
            recentSearchSuggestions: [
                { name: 'Recent 1', link: '/search?q=recent%201', type: 'recent', exactMatch: false },
                { name: 'Recent 2', link: '/search?q=recent%202', type: 'recent', exactMatch: false },
            ],
            searchPhrase: 'test',
        };

        it('should render popular search suggestions on mobile and desktop', () => {
            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={mockEinsteinSuggestions}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            expect(screen.getAllByText(t('search:suggestions.popularSearches'))).toHaveLength(2);
            expect(screen.getAllByText('Popular 1')).toHaveLength(2); // Mobile + Desktop
            expect(screen.getAllByText('Popular 2')).toHaveLength(2); // Mobile + Desktop
        });

        it('should render popular search suggestions on mobile and desktop', () => {
            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={mockEinsteinSuggestions}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            expect(screen.getAllByText(t('search:suggestions.popularSearches'))).toHaveLength(2);
            expect(screen.getAllByText('Popular 1')).toHaveLength(2); // Mobile + Desktop
            expect(screen.getAllByText('Popular 2')).toHaveLength(2); // Mobile + Desktop
        });

        it('should show all popular search suggestions when "Did you mean" is present', () => {
            const suggestionsWithDidYouMean = {
                ...mockEinsteinSuggestions,
                phraseSuggestions: [
                    { name: 'corrected search', link: '/search?q=corrected', type: 'phrase', exactMatch: false },
                ],
                popularSearchSuggestions: [
                    { name: 'Popular 1', link: '/search?q=popular%201', type: 'popular', exactMatch: false },
                    { name: 'Popular 2', link: '/search?q=popular%202', type: 'popular', exactMatch: false },
                    { name: 'Popular 3', link: '/search?q=popular%203', type: 'popular', exactMatch: false },
                ],
            };

            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={suggestionsWithDidYouMean}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            // Should show "Did you mean"
            expect(screen.getAllByText(/Did you mean/)).toHaveLength(2); // Mobile + Desktop

            // Should show all popular searches (no limit)
            expect(screen.getAllByText('Popular 1')).toHaveLength(2); // Mobile + Desktop
            expect(screen.getAllByText('Popular 2')).toHaveLength(2); // Mobile + Desktop
            expect(screen.getAllByText('Popular 3')).toHaveLength(2); // Mobile + Desktop
        });

        it('should show all popular search suggestions when "Did you mean" is not present', () => {
            const suggestionsWithoutDidYouMean = {
                ...mockEinsteinSuggestions,
                phraseSuggestions: [
                    { name: 'exact search', link: '/search?q=exact', type: 'phrase', exactMatch: true },
                ],
                popularSearchSuggestions: [
                    { name: 'Popular 1', link: '/search?q=popular%201', type: 'popular', exactMatch: false },
                    { name: 'Popular 2', link: '/search?q=popular%202', type: 'popular', exactMatch: false },
                    { name: 'Popular 3', link: '/search?q=popular%203', type: 'popular', exactMatch: false },
                    { name: 'Popular 4', link: '/search?q=popular%204', type: 'popular', exactMatch: false },
                ],
            };

            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={suggestionsWithoutDidYouMean}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            // Should not show "Did you mean" (exactMatch: true)
            expect(screen.queryByText(/Did you mean/)).not.toBeInTheDocument();

            // Should show all popular searches (no limit)
            expect(screen.getAllByText('Popular 1')).toHaveLength(2); // Mobile + Desktop
            expect(screen.getAllByText('Popular 2')).toHaveLength(2); // Mobile + Desktop
            expect(screen.getAllByText('Popular 3')).toHaveLength(2); // Mobile + Desktop
            expect(screen.getAllByText('Popular 4')).toHaveLength(2); // Mobile + Desktop
        });

        it('should not render Einstein sections when suggestions are empty', () => {
            const suggestionsWithoutEinstein = {
                ...mockSearchSuggestions,
                popularSearchSuggestions: undefined,
                recentSearchSuggestions: undefined,
            };

            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={suggestionsWithoutEinstein}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            expect(screen.queryByText(t('search:suggestions.popularSearches'))).not.toBeInTheDocument();
            expect(screen.queryByText(t('search:suggestions.recentSearches'))).not.toBeInTheDocument();
        });

        it('should not render Einstein sections when suggestions arrays are empty', () => {
            const suggestionsWithEmptyEinstein = {
                ...mockSearchSuggestions,
                popularSearchSuggestions: [],
                recentSearchSuggestions: [],
            };

            renderWithRouter(
                <SearchSuggestionsSection
                    searchSuggestions={suggestionsWithEmptyEinstein}
                    closeAndNavigate={mockCloseAndNavigate}
                />
            );

            expect(screen.queryByText(t('search:suggestions.popularSearches'))).not.toBeInTheDocument();
            expect(screen.queryByText(t('search:suggestions.recentSearches'))).not.toBeInTheDocument();
        });
    });
});
