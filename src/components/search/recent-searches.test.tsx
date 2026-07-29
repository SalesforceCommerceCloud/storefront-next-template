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
import { BrowserRouter } from 'react-router';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import RecentSearches from './recent-searches';

const { t } = getTranslation();

const renderWithRouter = (ui: React.ReactElement) => {
    return render(<BrowserRouter>{ui}</BrowserRouter>);
};

describe('RecentSearches Component', () => {
    const mockCloseAndNavigate = vi.fn();
    const mockClearRecentSearches = vi.fn();

    beforeEach(() => {
        mockCloseAndNavigate.mockClear();
        mockClearRecentSearches.mockClear();
    });

    it('should render empty wrapper when no recent searches', () => {
        renderWithRouter(
            <RecentSearches
                recentSearches={[]}
                closeAndNavigate={mockCloseAndNavigate}
                clearRecentSearches={mockClearRecentSearches}
            />
        );

        expect(screen.queryByText(t('search:suggestions.recentSearches'))).not.toBeInTheDocument();
        expect(screen.queryByText(t('search:suggestions.clearRecentSearches'))).not.toBeInTheDocument();
    });

    it('should render empty wrapper when recentSearches is undefined', () => {
        renderWithRouter(
            <RecentSearches
                recentSearches={undefined}
                closeAndNavigate={mockCloseAndNavigate}
                clearRecentSearches={mockClearRecentSearches}
            />
        );

        expect(screen.queryByText(t('search:suggestions.recentSearches'))).not.toBeInTheDocument();
        expect(screen.queryByText(t('search:suggestions.clearRecentSearches'))).not.toBeInTheDocument();
    });

    it('should render recent searches when provided', () => {
        const recentSearches = ['shoes', 'boots', 'sneakers'];

        renderWithRouter(
            <RecentSearches
                recentSearches={recentSearches}
                closeAndNavigate={mockCloseAndNavigate}
                clearRecentSearches={mockClearRecentSearches}
            />
        );

        expect(screen.getByText(t('search:suggestions.recentSearches'))).toBeInTheDocument();
        expect(screen.getByText('shoes')).toBeInTheDocument();
        expect(screen.getByText('boots')).toBeInTheDocument();
        expect(screen.getByText('sneakers')).toBeInTheDocument();
    });

    it('should call closeAndNavigate when a recent search is clicked', () => {
        const recentSearches = ['shoes'];

        renderWithRouter(
            <RecentSearches
                recentSearches={recentSearches}
                closeAndNavigate={mockCloseAndNavigate}
                clearRecentSearches={mockClearRecentSearches}
            />
        );

        const searchButton = screen.getByText('shoes');
        fireEvent.click(searchButton);

        expect(mockCloseAndNavigate).toHaveBeenCalledWith('/search?q=shoes');
    });

    it('should call clearRecentSearches when clear button is clicked', () => {
        const recentSearches = ['shoes', 'boots'];

        renderWithRouter(
            <RecentSearches
                recentSearches={recentSearches}
                closeAndNavigate={mockCloseAndNavigate}
                clearRecentSearches={mockClearRecentSearches}
            />
        );

        const clearButton = screen.getByText(t('search:suggestions.clearRecentSearches'));
        fireEvent.click(clearButton);

        expect(mockClearRecentSearches).toHaveBeenCalled();
    });

    it('should render multiple recent searches correctly', () => {
        const recentSearches = ['search 1', 'search 2', 'search 3', 'search 4', 'search 5'];

        renderWithRouter(
            <RecentSearches
                recentSearches={recentSearches}
                closeAndNavigate={mockCloseAndNavigate}
                clearRecentSearches={mockClearRecentSearches}
            />
        );

        recentSearches.forEach((search) => {
            expect(screen.getByText(search)).toBeInTheDocument();
        });

        expect(screen.getByText(t('search:suggestions.clearRecentSearches'))).toBeInTheDocument();
    });

    it('should render search items as interactive buttons', () => {
        const recentSearches = ['test'];

        renderWithRouter(
            <RecentSearches
                recentSearches={recentSearches}
                closeAndNavigate={mockCloseAndNavigate}
                clearRecentSearches={mockClearRecentSearches}
            />
        );

        const searchButton = screen.getByText('test');
        expect(searchButton.tagName).toBe('BUTTON');
        expect(searchButton).toHaveAttribute('type', 'button');
    });
});
