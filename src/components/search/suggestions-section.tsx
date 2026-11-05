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
import { Link } from '@/components/link';
import SuggestionsList from './suggestions-list';
import SuggestionsGrid from './suggestions-grid';
import { searchUrlBuilder } from '@/lib/url';
import { useTranslation } from 'react-i18next';
import { useAnalytics } from '@/hooks/use-analytics';
import type { PhraseSuggestion, SearchSuggestions } from './types';
import { useEffect, useRef } from 'react';
import { useLocation, useNavigation } from 'react-router';

interface SuggestionSectionProps {
    searchSuggestions: SearchSuggestions;
    closeAndNavigate: (link: string) => void;
}

interface DidYouMeanProps {
    suggestion: PhraseSuggestion;
    searchPhrase: string;
    onLinkClick: (link: string) => void;
}

const DidYouMean = ({ suggestion, searchPhrase, onLinkClick }: DidYouMeanProps) => {
    const { t } = useTranslation('search');
    const analytics = useAnalytics();

    const handleClickSearchSuggestion = () => {
        void analytics.trackClickSearchSuggestion({
            searchInputText: searchPhrase || '',
            suggestion: suggestion.name,
        });
        onLinkClick(suggestion.link);
    };

    return (
        <div className="mb-2">
            <p className="text-base text-header-foreground">
                {t('suggestions.didYouMean')}{' '}
                <Link
                    to={suggestion.link}
                    className="text-header-foreground hover:text-header-foreground/80 font-medium"
                    onMouseDown={handleClickSearchSuggestion}>
                    {suggestion.name}?
                </Link>
            </p>
        </div>
    );
};

export default function SuggestionSection({ searchSuggestions, closeAndNavigate }: SuggestionSectionProps) {
    const { t } = useTranslation('search');
    const analytics = useAnalytics();
    const location = useLocation();
    const navigation = useNavigation();

    const hasCategories = Boolean(searchSuggestions?.categorySuggestions?.length);
    const hasProducts = Boolean(searchSuggestions?.productSuggestions?.length);
    const hasPhraseSuggestions = Boolean(searchSuggestions?.phraseSuggestions?.length);
    const hasPopularSearches = Boolean(searchSuggestions?.popularSearchSuggestions?.length);

    const firstPhraseSuggestion = searchSuggestions?.phraseSuggestions?.[0];
    const showDidYouMean = hasPhraseSuggestions && firstPhraseSuggestion?.exactMatch === false;
    const searchPhrase = searchSuggestions?.searchPhrase || '';

    const lastTrackedSuggestionsRef = useRef<string | null>(null);
    const data = {
        searchInputText: searchPhrase,
        suggestions: [
            ...(searchSuggestions?.categorySuggestions || []).map((s) => s.name),
            ...(searchSuggestions?.productSuggestions || []).map((s) => s.name),
            ...(searchSuggestions?.phraseSuggestions || []).map((s) => s.name),
            ...(searchSuggestions?.popularSearchSuggestions || []).map((s) => s.name),
        ],
    };
    const suggestionsKey = JSON.stringify([location.key, location.pathname, location.search, data]);
    const trackingRef = useRef({ analytics, data });
    trackingRef.current = { analytics, data };

    useEffect(() => {
        if (navigation.state !== 'idle' || lastTrackedSuggestionsRef.current === suggestionsKey) return;
        const controller = new AbortController();
        const { analytics: currentAnalytics, data: currentData } = trackingRef.current;
        void currentAnalytics
            .trackViewSearchSuggestions(currentData, controller.signal)
            .then((handedOff) => {
                if (handedOff && !controller.signal.aborted) lastTrackedSuggestionsRef.current = suggestionsKey;
            })
            .catch(() => undefined);
        return () => controller.abort();
    }, [analytics.consentKey, navigation.state, suggestionsKey]);

    const handleLinkClick = (link: string) => {
        closeAndNavigate(link);
    };

    return (
        <div className="section-container py-6 space-y-0">
            {/* Mobile - Vertical alignment */}
            <div className="block md:hidden">
                {showDidYouMean && firstPhraseSuggestion && (
                    <DidYouMean
                        suggestion={firstPhraseSuggestion}
                        searchPhrase={searchPhrase}
                        onLinkClick={handleLinkClick}
                    />
                )}

                {hasCategories && (
                    <div className="mb-2">
                        <div className="text-sm font-semibold text-muted-foreground tracking-wide mb-2">
                            {t('suggestions.categories')}
                        </div>
                        <SuggestionsList
                            closeAndNavigate={closeAndNavigate}
                            suggestions={searchSuggestions.categorySuggestions}
                            searchPhrase={searchSuggestions.searchPhrase}
                        />
                    </div>
                )}

                {hasProducts && (
                    <div className="mb-2">
                        <div className="text-sm font-semibold text-muted-foreground tracking-wide mb-2">
                            {t('suggestions.products')}
                        </div>
                        <SuggestionsList
                            closeAndNavigate={closeAndNavigate}
                            suggestions={searchSuggestions.productSuggestions}
                            searchPhrase={searchSuggestions.searchPhrase}
                        />
                    </div>
                )}

                {hasPopularSearches && (
                    <div className="mb-2">
                        <div className="text-sm font-semibold text-muted-foreground tracking-wide mb-2">
                            {t('suggestions.popularSearches')}
                        </div>
                        <SuggestionsList
                            closeAndNavigate={closeAndNavigate}
                            suggestions={searchSuggestions.popularSearchSuggestions}
                            searchPhrase={searchSuggestions.searchPhrase}
                        />
                    </div>
                )}
            </div>

            {/* Desktop - Horizontal layout */}
            <div className="hidden md:flex gap-5">
                <div className="flex-1">
                    {showDidYouMean && firstPhraseSuggestion && (
                        <DidYouMean
                            suggestion={firstPhraseSuggestion}
                            searchPhrase={searchPhrase}
                            onLinkClick={handleLinkClick}
                        />
                    )}

                    {hasCategories && (
                        <div className="mb-2">
                            <div className="text-sm font-semibold text-muted-foreground tracking-wide mb-2">
                                {t('suggestions.categories')}
                            </div>
                            <SuggestionsList
                                closeAndNavigate={closeAndNavigate}
                                suggestions={searchSuggestions.categorySuggestions}
                                searchPhrase={searchSuggestions.searchPhrase}
                            />
                        </div>
                    )}

                    {hasPopularSearches && (
                        <div className="mb-2">
                            <div className="text-sm font-semibold text-muted-foreground tracking-wide mb-2">
                                {t('suggestions.popularSearches')}
                            </div>
                            <SuggestionsList
                                closeAndNavigate={closeAndNavigate}
                                suggestions={searchSuggestions.popularSearchSuggestions}
                                searchPhrase={searchSuggestions.searchPhrase}
                            />
                        </div>
                    )}
                </div>

                <div className="flex-[3] min-w-0 overflow-hidden">
                    {hasProducts && (
                        <SuggestionsGrid
                            closeAndNavigate={closeAndNavigate}
                            suggestions={searchSuggestions?.productSuggestions}
                            searchPhrase={searchPhrase}
                        />
                    )}
                </div>

                {/* Link to view all search results */}
                <div className="flex-1 flex items-center">
                    {hasProducts && (
                        <div className="text-center w-full">
                            <Link
                                to={searchUrlBuilder(searchSuggestions?.searchPhrase || '')}
                                className="text-header-foreground hover:text-header-foreground/80 font-medium text-sm"
                                onMouseDown={() =>
                                    handleLinkClick(searchUrlBuilder(searchSuggestions?.searchPhrase || ''))
                                }>
                                {t('suggestions.viewAll')}
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
