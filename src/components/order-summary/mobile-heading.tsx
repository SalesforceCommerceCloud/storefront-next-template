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
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { getOrderSummaryMobileHeading, type OrderSummaryBasket } from './mobile-heading-utils';
import { formatCurrency } from '@/lib/currency';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import { cn } from '@/lib/utils';

interface OrderSummaryMobileAccordionProps {
    basket: OrderSummaryBasket;
    defaultExpanded?: boolean;
    // When true, displays the total price alongside the heading.
    showPrice?: boolean;
    // When true, the heading reads "Estimated Total" instead of "Total".
    isEstimate?: boolean;
    // Keep summary content as children so parent routes retain lazy-loading boundaries.
    children: ReactNode;
    /**
     * Extra classes for the expanded accordion body. Callers that pin this accordion to the
     * viewport (e.g. a `fixed` mobile footer) should pass a bounded max-height plus
     * `overflow-y-auto` here, so expanded content stays reachable by scrolling instead of being
     * clipped by the viewport edge at narrow widths / high zoom (WCAG 1.4.10).
     */
    contentClassName?: string;
}

/**
 * Shared mobile wrapper for order-summary sections (cart + checkout).
 *
 * Responsibilities:
 * - Renders the mobile summary heading trigger with item-count text
 * - Optionally displays the estimated total price in the trigger (checkout)
 * - Manages collapsed/expanded accordion state
 * - Hosts caller-provided summary content in the accordion body
 *
 * Important design constraint:
 * - This component intentionally does NOT import `OrderSummary` directly.
 *   Parents pass summary content via `children` so route-level lazy-loading
 *   and code-splitting boundaries stay intact (especially on checkout).
 */
export function OrderSummaryMobileAccordion({
    basket,
    // Collapsed by default on mobile unless a caller opts in.
    defaultExpanded = false,
    showPrice = false,
    isEstimate = true,
    children,
    contentClassName,
}: OrderSummaryMobileAccordionProps): ReactElement {
    const { t, i18n } = useTranslation('cart');
    const { currency } = useSite();

    return (
        <Accordion
            type="single"
            collapsible
            defaultValue={defaultExpanded ? 'order-summary' : undefined}
            className="w-full border-b border-border">
            <AccordionItem value="order-summary" className="border-b-0">
                <AccordionTrigger className="px-[var(--cart-summary-px)] py-4 hover:no-underline items-center">
                    <span className="flex-1 flex items-center justify-between font-semibold text-primary">
                        <span className="text-left text-base">
                            {getOrderSummaryMobileHeading(t, basket, isEstimate)}
                        </span>
                        {showPrice && (
                            <span className="text-base shrink-0 ml-2">
                                {formatCurrency(
                                    basket?.orderTotal ?? basket?.productTotal ?? 0,
                                    i18n.language,
                                    currency
                                )}
                            </span>
                        )}
                    </span>
                </AccordionTrigger>
                <AccordionContent className={cn('p-0 pt-4 border-t border-border', contentClassName)}>
                    {children}
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    );
}
