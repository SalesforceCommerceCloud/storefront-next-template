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

import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SparklesIcon } from '@/components/icons';
import { StarIcon } from '@/components/product-ratings/star-icon';
import { Typography } from '@/components/typography';

export type AiInsightCardVariant = 'review' | 'shoppingAssistant';

export interface AiInsightCardProps {
    /**
     * Title for the card (e.g. "AI Review Summary" or "Shop with your Personal Assistant")
     */
    title: string;
    /**
     * Description text
     */
    description: string;
    /**
     * Optional badge next to the title (e.g. "Beta")
     */
    badgeText?: string;
    /**
     * Element to render the title as. Defaults to `h3`. Pass a non-heading
     * (e.g. `span`) where the card is a labelled block rather than a document
     * section, so the label does not read as a heading to assistive technology.
     */
    titleAs?: 'h2' | 'h3' | 'h4' | 'span' | 'p';
    /**
     * Variant: 'review' shows rating line (reviews section); 'shoppingAssistant' shows dark card with arrow (search page). Optional click when onActionClick is provided.
     */
    variant: AiInsightCardVariant;
    /**
     * For variant 'review': average rating (0–5) and review count
     */
    rating?: number;
    reviewCount?: number;
    /**
     * For variant 'shoppingAssistant': called when the card is clicked (optional; omit for non-clickable card).
     */
    onActionClick?: () => void;
    /**
     * When true, uses tighter padding and smaller icon for compact contexts (e.g. search dropdown).
     * When false, card height grows with content (e.g. AI review summary with long text).
     */
    compact?: boolean;
    className?: string;
    /**
     * Test id for the root element
     */
    'data-testid'?: string;
}

/** Icon box: light grey background and black sparkles. When compact, fixed square size so it does not elongate on mobile. Use dark for shopping assistant card. */
function SparkleIconBox({
    compact,
    dark,
    className,
}: {
    compact?: boolean;
    dark?: boolean;
    className?: string;
}): ReactElement {
    return (
        <div
            className={cn(
                'flex shrink-0 items-center justify-center rounded-ui',
                dark ? 'bg-white/10 text-white' : 'bg-gray-100 text-black',
                compact ? 'w-9 h-9' : 'w-8 h-8 sm:w-10 sm:h-10',
                className
            )}
            aria-hidden="true">
            <SparklesIcon
                className={cn('shrink-0', compact ? 'w-3.5 h-3.5' : 'w-4 h-4 sm:w-5 sm:h-5', dark && '!text-white')}
                style={dark ? { color: 'white' } : { color: 'black' }}
            />
        </div>
    );
}

/**
 * AI-assisted insight card with two variants: 'review' (reviews section, with rating) and 'shoppingAssistant' (search page, dark card; optional onActionClick).
 */
export function AiInsightCard({
    title,
    description,
    badgeText,
    titleAs = 'h3',
    variant,
    rating = 0,
    reviewCount = 0,
    onActionClick,
    compact = false,
    className,
    'data-testid': dataTestId = 'ai-insight-card',
}: AiInsightCardProps): ReactElement {
    const { t } = useTranslation();
    const formattedRating = Number((rating ?? 0).toFixed(1)).toString();
    const isShoppingAssistant = variant === 'shoppingAssistant';
    const isClickable = isShoppingAssistant && Boolean(onActionClick);
    const isDark = isShoppingAssistant;

    const content = (
        <div className={cn('flex items-stretch gap-2', compact && 'gap-3')}>
            <div className={cn('shrink-0', compact ? 'flex items-center self-stretch' : 'pt-0.5')}>
                <SparkleIconBox compact={compact} dark={isDark} />
            </div>
            <div className={cn('flex-1 min-w-0 overflow-visible', compact ? 'space-y-0.5' : 'space-y-1')}>
                <div className="flex items-center gap-2 flex-wrap">
                    <Typography
                        variant="small"
                        as={titleAs}
                        className={cn('font-semibold', isDark ? 'text-white' : 'text-neutral-900')}>
                        {title}
                    </Typography>
                    {badgeText && (
                        <span
                            data-slot="badge"
                            className={cn(
                                'inline-flex items-center justify-center text-xs font-medium px-2 py-1 shrink-0 rounded-ui',
                                isDark ? 'bg-white/10 text-white' : 'bg-gray-100 text-gray-800'
                            )}>
                            {badgeText}
                        </span>
                    )}
                </div>
                <Typography
                    variant={isDark ? 'small' : 'muted'}
                    as="p"
                    className={cn(
                        'mt-0 mb-0 leading-relaxed break-words [&:not(:first-child)]:mt-0',
                        isDark ? 'text-neutral-200 font-normal' : 'text-gray-600',
                        compact ? 'text-xs' : 'sm:text-sm'
                    )}>
                    {description}
                </Typography>
                {variant === 'review' && (
                    <div
                        className={cn(
                            'flex items-center gap-1.5 sm:text-xs',
                            isDark ? 'text-neutral-400' : 'text-gray-600'
                        )}>
                        <StarIcon
                            filled={true}
                            opacity={1}
                            className="size-4 text-rating shrink-0"
                            aria-hidden="true"
                        />
                        <span className={cn('font-semibold', isDark ? 'text-white' : 'text-neutral-900')}>
                            {formattedRating}
                        </span>
                        <span>·</span>
                        <span>{t('product:rating.basedOnReviews', { count: reviewCount })}</span>
                    </div>
                )}
                {!compact && isShoppingAssistant && (
                    <div className="flex items-center justify-end">
                        <ArrowRight
                            className={cn(
                                'w-5 h-5 shrink-0 transition-colors',
                                isDark ? 'text-white' : 'text-gray-500 group-hover:text-black'
                            )}
                            strokeWidth={2.5}
                            aria-hidden="true"
                        />
                    </div>
                )}
            </div>
            {compact && isShoppingAssistant && (
                <div className="shrink-0 flex items-center">
                    <ArrowRight
                        className={cn(
                            'w-5 h-4 transition-colors',
                            isDark ? 'text-white' : 'text-gray-500 group-hover:text-black'
                        )}
                        strokeWidth={2.5}
                        aria-hidden="true"
                    />
                </div>
            )}
        </div>
    );

    const wrapperClassName = cn(
        'border rounded-ui',
        isDark ? (compact ? 'p-3.5' : 'p-5') : compact ? 'p-2.5' : 'p-4',
        isClickable && 'cursor-pointer',
        isDark ? 'bg-neutral-900 border-neutral-800' : 'border-border bg-background',
        className
    );

    if (isClickable && onActionClick) {
        return (
            <button
                type="button"
                onMouseDown={(event) => {
                    event.preventDefault();
                }}
                onClick={onActionClick}
                className={cn('group w-full text-left', wrapperClassName)}
                data-testid={dataTestId}
                aria-label={title}>
                {content}
            </button>
        );
    }

    return (
        <div className={wrapperClassName} data-testid={dataTestId}>
            {content}
        </div>
    );
}
