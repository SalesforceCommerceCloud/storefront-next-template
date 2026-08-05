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
import { type ReactElement, type RefObject, lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { OrderLike } from '@/lib/order-management/types';
import { getReturnableItems } from '@/lib/order-management/return';
import { isCancellable, isOrderCancelled } from '@/lib/order-management/cancel';
import type { OmsMetaDataResult } from '@/lib/api/order.server';
import type { CancelActionResult } from '@/components/account/order-details/cancel-order-dialog';
import type { ActionResponse as ReturnActionResponse } from '@/components/account/order-details/return-order-dialog';

// Lazy-loaded: hidden overlay on initial render (see
// docs/README-PERFORMANCE.md#lazy-loading-for-overlays-modals-drawers-dialogs).
const ReturnOrderDialog = lazy(() =>
    import('@/components/account/order-details/return-order-dialog').then((m) => ({ default: m.default }))
);
const CancelOrderDialog = lazy(() => import('@/components/account/order-details/cancel-order-dialog'));

// Delay before surfacing feedback, so screen readers finish announcing the dialog close
// before the alert steals the live-region announcement (matches the registered-customer flow).
const ANNOUNCE_DELAY_MS = 300;

export type GuestOrderActionsProps = {
    order: Partial<OrderLike>;
    omsMetaData: OmsMetaDataResult;
    orderNumber: string;
    email: string;
    /**
     * Called with the fresh order + OMS metadata after a successful cancel/return. The guest
     * flow has no revalidating loader (the order arrived via a one-shot fetcher response), so
     * the results page needs this to re-render with updated eligibility/quantities.
     */
    onOrderUpdated: (order: Partial<OrderLike>, omsMetaData: OmsMetaDataResult) => void;
    /**
     * Ref pointing at the page heading. Used as the focus fallback target when the cancel/return
     * trigger button has unmounted (e.g. after a successful cancel hides the Cancel button). If
     * omitted, focus falls through to the dialog's own fallback chain.
     */
    headingFallbackRef?: RefObject<HTMLElement | null>;
};

type Feedback = { status: 'success' | 'error'; title: string; description: string };

/**
 * Cancel/return entry points for the guest order lookup results page. Mirrors the
 * registered-customer `CancelItemsAction`/`ReturnItemsAction` architecture (same reused
 * dialogs), but without an ownership gate — guest identity is proven via the verification
 * token cookie, not `customerId` — and without Suspense/Await, since `omsMetaData` and the
 * order both arrive already resolved in the one-shot lookup fetch response.
 */
export function GuestOrderActions({
    order,
    omsMetaData,
    orderNumber,
    email,
    onOrderUpdated,
    headingFallbackRef,
}: GuestOrderActionsProps): ReactElement | null {
    const { t } = useTranslation('account');
    const [returnDialogOpen, setReturnDialogOpen] = useState(false);
    const [returnDialogLoaded, setReturnDialogLoaded] = useState(false);
    const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
    const [cancelDialogLoaded, setCancelDialogLoaded] = useState(false);
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const [cancelSucceeded, setCancelSucceeded] = useState(false);
    const [cancelTerminal, setCancelTerminal] = useState(false);
    const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const returnButtonRef = useRef<HTMLButtonElement | null>(null);
    const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        return () => {
            if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
        };
    }, []);

    const clearFeedback = useCallback(() => {
        if (feedbackTimerRef.current) {
            clearTimeout(feedbackTimerRef.current);
            feedbackTimerRef.current = null;
        }
        setFeedback(null);
    }, []);

    const handleReturnSettled = useCallback(
        (result: ReturnActionResponse) => {
            if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);

            if (result.success && result.order && result.omsMetaData) {
                onOrderUpdated(result.order as Partial<OrderLike>, result.omsMetaData);
            }

            feedbackTimerRef.current = setTimeout(() => {
                if (result.success) {
                    setFeedback({
                        status: 'success',
                        title: t('orders.returnSuccessTitle'),
                        description: t('orders.returnSuccessMessage'),
                    });
                }
            }, ANNOUNCE_DELAY_MS);
        },
        [t, onOrderUpdated]
    );

    const handleCancelSettled = useCallback(
        (result: CancelActionResult) => {
            if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);

            if (result.success) {
                setCancelSucceeded(true);
                if (result.order && result.omsMetaData) {
                    onOrderUpdated(result.order as Partial<OrderLike>, result.omsMetaData);
                }
            } else {
                const status = result.error?.status;
                if (status === 404 || status === 409) setCancelTerminal(true);
            }

            feedbackTimerRef.current = setTimeout(() => {
                if (result.success) {
                    setFeedback({
                        status: 'success',
                        title: t('orders.cancelSuccessTitle'),
                        description: t('orders.cancelSuccessDescription'),
                    });
                } else {
                    const status = result.error?.status;
                    let title: string;
                    let description: string;
                    if (status === 404) {
                        title = t('orders.cancelErrorNotFoundTitle');
                        description = t('orders.cancelErrorNotFoundDescription');
                    } else if (status === 409) {
                        title = t('orders.cancelErrorConflictTitle');
                        description = t('orders.cancelErrorConflictDescription');
                    } else {
                        title = t('orders.cancelErrorGenericTitle');
                        description = t('orders.cancelErrorGenericDescription');
                    }
                    setFeedback({ status: 'error', title, description });
                }
            }, ANNOUNCE_DELAY_MS);
        },
        [t, onOrderUpdated]
    );

    if (!omsMetaData.omsActive) {
        return null;
    }

    const orderNo = order.orderNo ?? orderNumber;
    const extraFields = { email };

    const returnDisabled = getReturnableItems(order).length === 0 || cancelSucceeded;
    const cancelDisabled = !isCancellable(order) || isOrderCancelled(order) || cancelSucceeded || cancelTerminal;

    return (
        <div data-section="guest-order-actions">
            <div aria-live="assertive" aria-atomic="true">
                {feedback && (
                    <Alert
                        role="presentation"
                        variant={feedback.status === 'error' ? 'destructive' : 'default'}
                        data-testid="guest-order-actions-feedback"
                        className="mb-4">
                        <AlertTitle>{feedback.title}</AlertTitle>
                        <AlertDescription>{feedback.description}</AlertDescription>
                    </Alert>
                )}
            </div>
            <div className="flex flex-wrap gap-2 empty:hidden" data-slot="order-actions">
                <Button
                    ref={returnButtonRef}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto aria-disabled:pointer-events-none aria-disabled:opacity-50"
                    aria-disabled={returnDisabled || undefined}
                    aria-describedby={returnDisabled ? 'guest-return-items-unavailable-reason' : undefined}
                    onClick={() => {
                        if (returnDisabled) {
                            return;
                        }
                        clearFeedback();
                        setReturnDialogLoaded(true);
                        setReturnDialogOpen(true);
                    }}>
                    {t('orders.returnItems')}
                </Button>
                {returnDisabled && (
                    <span id="guest-return-items-unavailable-reason" className="sr-only">
                        {t('orders.returnUnavailable')}
                    </span>
                )}

                <Button
                    ref={cancelButtonRef}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto aria-disabled:pointer-events-none aria-disabled:opacity-50"
                    aria-disabled={cancelDisabled || undefined}
                    aria-describedby={cancelDisabled ? 'guest-cancel-order-unavailable-reason' : undefined}
                    onClick={() => {
                        if (cancelDisabled) {
                            return;
                        }
                        clearFeedback();
                        setCancelDialogLoaded(true);
                        setCancelDialogOpen(true);
                    }}>
                    {t('orders.cancelOrder')}
                </Button>
                {cancelDisabled && (
                    <span id="guest-cancel-order-unavailable-reason" className="sr-only">
                        {t('orders.cancelUnavailable')}
                    </span>
                )}
            </div>

            {returnDialogLoaded && (
                <Suspense fallback={null}>
                    <ReturnOrderDialog
                        order={order}
                        returnReasonCodes={omsMetaData.returnReasonCodes}
                        open={returnDialogOpen}
                        onOpenChange={setReturnDialogOpen}
                        onSettled={handleReturnSettled}
                        triggerRef={returnButtonRef}
                        fallbackFocusRef={headingFallbackRef}
                        action="/action/order-lookup-return"
                        orderNumberFieldName="orderNumber"
                        extraFields={extraFields}
                    />
                </Suspense>
            )}
            {cancelDialogLoaded && (
                <Suspense fallback={null}>
                    <CancelOrderDialog
                        orderNo={orderNo}
                        cancelReasonCodes={omsMetaData.cancelReasonCodes}
                        open={cancelDialogOpen}
                        onOpenChange={setCancelDialogOpen}
                        onSettled={handleCancelSettled}
                        triggerRef={cancelButtonRef}
                        fallbackFocusRef={headingFallbackRef}
                        action="/action/order-lookup-cancel"
                        orderNumberFieldName="orderNumber"
                        extraFields={extraFields}
                    />
                </Suspense>
            )}
        </div>
    );
}

export default GuestOrderActions;
