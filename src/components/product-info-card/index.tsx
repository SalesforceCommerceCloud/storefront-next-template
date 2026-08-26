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

import { type ReactElement, type ReactNode } from 'react';
import { Typography } from '@/components/typography';
import { cn } from '@/lib/utils';

interface ProductInfoCardProps {
    /** Optional icon element displayed on the left side of the card */
    icon?: ReactNode;
    /** Card title text (rendered bold) */
    title: string;
    /**
     * Element to render the title as. Defaults to `p`. Pass a heading level
     * (e.g. `h2`) when the card is a labelled section of the page so the title
     * joins the document outline instead of reading as plain text.
     */
    titleAs?: 'h2' | 'h3' | 'h4' | 'p';
    /** Card description or subtitle text */
    description?: string;
    /** Optional action link/button rendered below the description */
    action?: {
        label: string;
        onClick: () => void;
    };
    /** Optional CSS class for the border (default: border with visible light gray) */
    borderClassName?: string;
    /** Optional additional CSS classes */
    className?: string;
}

/**
 * Reusable info card component for PDP sections such as Free Shipping,
 * Returns & Warranty, and Estimated Delivery.
 *
 * Renders a card with a full border, icon, title, description,
 * and optional action link. Designed for consistent PDP info cards.
 *
 * @example
 * ```tsx
 * <ProductInfoCard
 *     icon={<CalendarDays className="h-5 w-5" />}
 *     title="Estimated Delivery"
 *     description="Sep 15-16 · Shipping options available"
 *     action={{ label: "Learn More", onClick: handleLearnMore }}
 * />
 * ```
 */
export default function ProductInfoCard({
    icon,
    title,
    titleAs = 'p',
    description,
    action,
    borderClassName,
    className,
}: ProductInfoCardProps): ReactElement {
    return (
        <div
            className={cn(
                'flex items-start gap-3 rounded-ui border-2 bg-secondary p-4',
                borderClassName ?? 'border-order-border',
                className
            )}>
            {icon && <div className="flex-shrink-0 mt-0.5 text-muted-foreground">{icon}</div>}
            <div className="min-w-0 flex-1">
                <Typography
                    variant="small"
                    as={titleAs}
                    className="text-base font-semibold leading-6 text-card-foreground">
                    {title}
                </Typography>
                {description && (
                    <Typography
                        variant="muted"
                        className="mt-0.5 text-xs font-normal leading-none text-secondary-foreground">
                        {description}
                    </Typography>
                )}
                {action && (
                    <button
                        type="button"
                        onClick={action.onClick}
                        aria-label={`${action.label} - ${title}`}
                        className="mt-1 cursor-pointer text-sm font-normal leading-5 text-primary hover:underline">
                        {action.label}
                    </button>
                )}
            </div>
        </div>
    );
}
