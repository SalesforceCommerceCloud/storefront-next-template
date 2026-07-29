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
import { searchUrlBuilder } from '@/lib/url';
import { useTranslation } from 'react-i18next';

interface RecentSearchesProps {
    recentSearches?: string[];
    closeAndNavigate: (link: string) => void;
    clearRecentSearches: () => void;
}

export default function RecentSearches({
    recentSearches = [],
    closeAndNavigate,
    clearRecentSearches,
}: RecentSearchesProps) {
    const { t } = useTranslation('search');
    return (
        <div className="section-container py-6">
            {recentSearches.length > 0 && (
                <div>
                    <div className="text-sm font-semibold text-muted-foreground tracking-wide mb-2">
                        {t('suggestions.recentSearches')}
                    </div>
                    <div>
                        {recentSearches.map((recentSearch) => (
                            <button
                                key={recentSearch}
                                type="button"
                                data-slot="suggestion"
                                onClick={() => {
                                    closeAndNavigate(searchUrlBuilder(recentSearch));
                                }}
                                className="w-full text-left pl-4 py-2 hover:bg-accent hover:text-foreground text-sm font-medium">
                                {recentSearch}
                            </button>
                        ))}
                        <button
                            type="button"
                            data-slot="suggestion"
                            onClick={clearRecentSearches}
                            className="w-full text-left py-2 hover:bg-accent hover:text-foreground text-sm font-medium">
                            {t('suggestions.clearRecentSearches')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
