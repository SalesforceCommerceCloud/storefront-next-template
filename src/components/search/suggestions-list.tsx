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
import type React from 'react';
import { cn } from '@/lib/utils';
import { DynamicImage } from '@/components/dynamic-image';
import { useAnalytics } from '@/hooks/use-analytics';
import { toImageUrl } from '@/lib/images/dynamic-image';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { useTranslation } from 'react-i18next';

interface Suggestion {
    name: string;
    link: string;
    type: string;
    image?: string;
    parentCategoryName?: string;
}

interface SuggestionsProps {
    suggestions?: Suggestion[];
    searchPhrase?: string;
    closeAndNavigate?: (link: string) => void;
    className?: string;
}

const Suggestions: React.FC<SuggestionsProps> = ({ suggestions, searchPhrase, closeAndNavigate, className }) => {
    const analytics = useAnalytics();
    const config = useConfig();
    const { t } = useTranslation('common');
    if (!suggestions || suggestions.length === 0) {
        return null;
    }

    const handleClick = (suggestion: Suggestion) => {
        void analytics.trackClickSearchSuggestion({
            searchInputText: searchPhrase || '',
            suggestion: suggestion.name,
        });
        if (closeAndNavigate) {
            closeAndNavigate(suggestion.link);
        }
    };

    return (
        <div data-testid="sf-suggestion" className={cn('space-y-0', className)}>
            <div>
                {suggestions.map((suggestion) => (
                    <button
                        key={suggestion.link}
                        type="button"
                        data-slot="suggestion"
                        onClick={() => handleClick(suggestion)}
                        className="w-full flex justify-start items-center pl-4 py-0 hover:bg-accent hover:text-foreground transition-colors text-sm mt-0">
                        <div className="flex items-center">
                            {suggestion.image && (
                                <div className="w-10 h-8 mr-4 rounded-full bg-transparent flex items-center justify-center overflow-hidden shrink-0">
                                    <DynamicImage
                                        src={`${toImageUrl({ src: suggestion.image, config })}[?sw={width}]`}
                                        alt={suggestion.name || t('suggestionImageAlt')}
                                        className="w-full h-full"
                                        imageProps={{
                                            className: 'w-full h-full object-cover rounded-full',
                                        }}
                                        loading="eager"
                                    />
                                </div>
                            )}
                            <div className="text-left">
                                <span className="text-sm font-medium">{suggestion.name}</span>
                            </div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default Suggestions;
