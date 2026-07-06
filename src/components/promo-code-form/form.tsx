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
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

// components
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Form } from '@/components/ui/form';
import { PromoCodeFields } from './promo-code-field';
import { Check, X as CloseIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/currency';
//hooks
import { useToast } from '@/components/toast';
import { usePromoCodeActions } from '@/hooks/use-promo-code-actions';
import { useBasketUpdater } from '@/providers/basket';
import { FETCHER_STATES } from '@/lib/fetcher-states';
import { isCouponApplied } from '@/lib/cart/coupon-status';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';

//types
import { createPromoCodeFormSchema, type PromoCodeFormData } from './index';
import type { BasketActionResponse } from '@/routes/types/action-responses';
import { type AppliedCouponRowProps, type PromoCodeFormProps } from './types';
import { useTranslation } from 'react-i18next';

// value for promo code accordion that will be used for open/close state
const PROMO_CODE_FORM_VAL = 'promo-code';
/**
 * PromoCodeForm component that provides an accordion-based interface for applying promo codes to a shopping basket.
 *
 * This component renders as a collapsible accordion containing a form for entering and submitting promo codes.
 * It handles form validation, submission, and displays appropriate success/error feedback through toasts.
 * The form automatically resets and closes the accordion on successful submission.
 *
 * @param basketId - Optional basket ID to associate the promo code with. If not provided, form submission will
 *                   show an error.
 *
 * @returns JSX element containing the promo code form wrapped in an accordion
 *
 * @example
 * ```tsx
 * // Basic usage with basket ID
 * <PromoCodeForm basketId="basket-123" />
 *
 * // Usage without basket ID (will show error on submit)
 * <PromoCodeForm />
 * ```
 *
 */
export const PromoCodeForm = ({ basket }: PromoCodeFormProps) => {
    const { t } = useTranslation('cart');
    const basketId = basket?.basketId;
    const [isOpen, setIsOpen] = useState(true);
    const { applyPromoCode, applyFetcher } = usePromoCodeActions(basketId);
    const { addToast } = useToast();
    const updateBasket = useBasketUpdater();
    const { currency: siteCurrency } = useSite();

    const schema = useMemo(() => createPromoCodeFormSchema(t), [t]);

    // Only render coupons that actually produced a discount. SCAPI keeps
    // valid-but-ineligible coupons (e.g. statusCode 'no_applicable_promotion')
    // on the basket so they auto-apply once a qualifying item is added, but
    // they must not be presented to the shopper as applied.
    const appliedCoupons = useMemo(() => basket?.couponItems?.filter(isCouponApplied) ?? [], [basket?.couponItems]);

    const form = useForm<PromoCodeFormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            code: '',
        },
    });

    // The code whose apply failed and still owns the inline field error. Once set,
    // this stays fixed until that code applies or a new apply succeeds, so editing
    // the input can't change which code the clear-on-applied effect is waiting on.
    const [failedCode, setFailedCode] = useState<string | null>(null);

    /**
     * Handles the response from the promo code application API call.
     *
     * This effect monitors the applyFetcher.data for changes and processes the response:
     * - On success: resets the form, closes the accordion, and shows success toast
     * - On error: sets form error state and shows error toast
     *
     * @dependencies applyFetcher.data, form
     */
    useEffect(() => {
        if (applyFetcher.data) {
            if (applyFetcher.data.success) {
                // Publish the new revision so useBasket() consumers stay in sync, matching the other basket
                // mutation handlers. Dedups by `lastModified`. Shape-safe: no basket read or mutation sets
                // `expand`, so every response carries the SCAPI default and can't down-shape provider consumers.
                const responseBasket = (applyFetcher.data as BasketActionResponse).basket;
                if (responseBasket) {
                    updateBasket(responseBasket);
                }
                form.reset({ code: '' });
                setFailedCode(null);
                addToast(t('promoCode.successMessage'), 'success');
            } else {
                // Prefer the server's status-specific message (e.g. "not applicable
                // to your cart" for a valid-but-ineligible coupon) and fall back to
                // the generic message when the action didn't provide one.
                const errorMessage = applyFetcher.data.error?.message || t('promoCode.errorMessage');

                // Set the form error with the specific API error message
                form.setError('code', {
                    type: 'manual',
                    message: errorMessage,
                });
                // Remember which code this error belongs to so the effect below
                // can clear it if that same code later auto-applies. The form is not
                // reset on failure, so the submitted code is still in the field.
                setFailedCode(form.getValues('code'));

                // Show error toast
                addToast(errorMessage, 'error');
            }
        }
        // addToast is stable and does not need to be in the dependency array
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [applyFetcher.data, form, t, updateBasket]);

    /**
     * Clears the stale inline apply error once the failed code actually applies.
     *
     * A valid-but-ineligible coupon is parked on the basket and auto-applies when
     * the shopper later changes a cart line to a qualifying variant. That path
     * revalidates the cart loader (updating `appliedCoupons`) but does NOT re-fire
     * the apply fetcher, so the effect above never re-runs to clear the error it
     * set. This effect reacts to basket state instead: when the code that failed
     * now appears among the applied coupons, drop its inline error.
     *
     * Keyed to the specific `failedCode` (not just "any coupon applied") so an
     * unrelated coupon applying can't wipe a fresh error for a different code.
     */
    useEffect(() => {
        if (!failedCode) return;
        const nowApplied = appliedCoupons.some((item) => item.code?.toLowerCase() === failedCode.toLowerCase());
        if (nowApplied) {
            form.clearErrors('code');
            setFailedCode(null);
        }
    }, [appliedCoupons, failedCode, form]);

    /**
     * Handles form submission for applying a promo code.
     *
     * This function is called when the form is submitted and performs the following:
     * 1. Validates that a basket ID is available
     * 2. If no basket ID, sets a form error and returns early
     * 3. If basket ID exists, calls the applyPromoCode function with the entered code
     *
     * @param data - The validated form data containing the promo code
     * @param data.code - The promo code string entered by the user
     */
    const handleSubmit = form.handleSubmit((data) => {
        if (!basketId) {
            form.setError('code', {
                type: 'manual',
                message: t('promoCode.noBasketMessage'),
            });
            return;
        }

        applyPromoCode(data.code);
    });

    return (
        <div className="flex w-full flex-col gap-2 pt-2 pb-4">
            <Accordion
                type="single"
                collapsible
                value={isOpen ? PROMO_CODE_FORM_VAL : ''}
                onValueChange={(value) => setIsOpen(value === PROMO_CODE_FORM_VAL)}
                className="mb-0">
                <AccordionItem value={PROMO_CODE_FORM_VAL}>
                    <AccordionTrigger
                        onClick={() => form.reset()}
                        className="justify-start gap-2 pt-1 pb-0 [&>svg]:text-primary">
                        <span className="text-left text-sm font-medium leading-5 text-card-foreground">
                            {t('promoCode.accordionTitle')}
                        </span>
                    </AccordionTrigger>
                    <AccordionContent className="px-0 pt-2 pb-2">
                        <Form {...form}>
                            <form onSubmit={(e) => void handleSubmit(e)} data-testid="promo-code-form">
                                <PromoCodeFields form={form} applyFetcher={applyFetcher} />
                            </form>
                        </Form>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>

            {appliedCoupons.length > 0 && (
                <div className="space-y-1" data-testid="applied-coupons">
                    {appliedCoupons.map((item) => (
                        <AppliedCouponRow
                            key={item.couponItemId}
                            item={item}
                            basketId={basketId}
                            currency={basket?.currency ?? siteCurrency}
                            priceAdjustments={[
                                ...(basket?.orderPriceAdjustments ?? []),
                                ...(basket?.productItems ?? []).flatMap((p) => p.priceAdjustments ?? []),
                            ]}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

/**
 * One applied coupon: badge + Remove button + optional discount line.
 *
 * Each row owns its own fetcher (via `usePromoCodeActions`) and its own remove-toast effect.
 * Because every `useFetcher()` call returns an independent fetcher by default, sibling rows
 * can be removed concurrently without sharing submission state. The disabled rule is therefore
 * just `state !== IDLE` — no `formData.couponItemId` inspection needed.
 *
 * SCAPI basket has optimistic concurrency on basket version; rapidly firing concurrent removes
 * can race and one may 409. The error toast surfaces this and the user retries.
 */
export const AppliedCouponRow = ({ item, basketId, currency, priceAdjustments }: AppliedCouponRowProps) => {
    const { t, i18n } = useTranslation('cart');
    const { removePromoCode, removeFetcher } = usePromoCodeActions(basketId);
    const { addToast } = useToast();
    const updateBasket = useBasketUpdater();
    const isRemoving = removeFetcher.state !== FETCHER_STATES.IDLE;

    useEffect(() => {
        if (removeFetcher.data) {
            if (removeFetcher.data.success) {
                // Publish the new revision so useBasket() consumers stay in sync, matching the other basket
                // mutation handlers. Dedups by `lastModified`. Shape-safe: no basket read or mutation sets
                // `expand`, so every response carries the SCAPI default and can't down-shape provider consumers.
                const responseBasket = (removeFetcher.data as BasketActionResponse).basket;
                if (responseBasket) {
                    updateBasket(responseBasket);
                }
                addToast(t('promoCode.removeSuccessMessage'), 'success');
            } else if (removeFetcher.data.error) {
                addToast(t('promoCode.removeErrorMessage'), 'error');
            }
        }
        // addToast is stable and does not need to be in the dependency array
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [removeFetcher.data, t, updateBasket]);

    // Sum every price adjustment (order-level AND line-item-level) tied to this coupon.
    // SCAPI splits coupon discounts across both based on whether the promotion targets
    // the whole order or specific products — line-item-scoped promos like "10% off men's
    // suits" only appear under productItems[].priceAdjustments. Values are negative,
    // so formatCurrency renders e.g. "−£19.20" without extra negation.
    const couponTotal =
        priceAdjustments
            ?.filter((adj) => adj.couponCode === item.code)
            .reduce((sum, adj) => sum + (adj.price ?? 0), 0) ?? 0;

    return (
        <div className="flex items-center justify-between py-1">
            <div className="inline-flex items-stretch">
                <Badge
                    variant="secondary"
                    className="gap-1 text-xs font-semibold leading-4 text-secondary-foreground whitespace-normal break-words">
                    <Check className="size-3" />
                    {item.code}
                </Badge>
                <Button
                    type="button"
                    variant="secondary"
                    size="icon-sm"
                    aria-label={`${t('promoCode.remove')} ${item.code}`}
                    disabled={isRemoving}
                    className="h-auto w-auto px-1.5 py-0.5"
                    onClick={() => {
                        if (item.couponItemId) {
                            removePromoCode(item.couponItemId);
                        }
                    }}>
                    <CloseIcon className="size-3" />
                </Button>
            </div>
            {couponTotal !== 0 && (
                <span className="text-sm font-normal leading-5 text-muted-foreground text-right">
                    {formatCurrency(couponTotal, i18n.language, currency)}
                </span>
            )}
        </div>
    );
};
