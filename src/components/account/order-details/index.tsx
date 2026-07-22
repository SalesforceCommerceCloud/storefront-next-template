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
import {
    type ReactElement,
    type RefObject,
    lazy,
    Suspense,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Await } from 'react-router';
import { Check, ChevronDown, ExternalLink, Hash, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTranslation } from 'react-i18next';
import type { ShopperOrders } from '@/scapi';
import OrderItemsList, { type ProductDataById } from '@/components/account/order-details/order-items-list';
import OrderTracking from '@/components/account/order-tracking';
import { getOrderTrackingEntries } from '@/lib/order-management/tracking';
import {
    getTrackOptionLabels,
    getTrackShipmentHref,
    getTrackShipmentTargets,
    hasVisibleTrackingCard,
} from '@/components/account/order-tracking/track-shipment';
import OrderSummary from '@/components/order-summary';
import ShippingAddressDisplay from '@/components/checkout/components/shipping-address-display';
import {
    ORDER_STATUS_BADGE_CLASS,
    formatStatusFallbackLabel,
    getOrderCancelStatusConfig,
    getOrderReturnStatus,
    getOrderReturnStatusConfig,
    getOrderStatusConfig,
    getShippingStatusConfig,
    resolveOrderStatus,
} from '@/lib/order/status';
import { cn } from '@/lib/utils';
import { UITarget } from '@/targets/ui-target';
import { useAuth } from '@/providers/auth';
import { getReturnableItems, isOrderOwnedBy } from '@/lib/order-management/return';
import { canCancelOrder, isOrderCancelled } from '@/lib/order-management/cancel';
import type { CancelActionResult } from '@/components/account/order-details/cancel-order-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { OmsMetaDataResult } from '@/lib/api/order.server';

export type { ProductDataById };

// Lazy-loaded: the return dialog is a hidden overlay on initial render (see
// docs/README-PERFORMANCE.md#lazy-loading-for-overlays-modals-drawers-dialogs).
const ReturnOrderDialog = lazy(() =>
    import('@/components/account/order-details/return-order-dialog').then((m) => ({ default: m.default }))
);

const CancelOrderDialog = lazy(() => import('@/components/account/order-details/cancel-order-dialog'));

const BADGE_BASE_CLASSES = 'shrink-0 font-semibold border-0 py-1 w-fit';

// Delay before surfacing the cancel feedback alert, so screen readers finish
// announcing the dialog close before the alert steals the live-region announcement.
const ANNOUNCE_DELAY_MS = 300;

export type OrderDetailsProps = {
    order: ShopperOrders.schemas['Order'];
    productsById: ProductDataById;
    /**
     * Deferred OMS cancel/return reason codes from the route loader. Optional —
     * omitted entirely, the Return Items entry point stays hidden (no reason
     * codes to build a return with). Never rejects (see `fetchOmsMetaData`).
     */
    omsMetaData?: Promise<OmsMetaDataResult>;
};

type ProductItem = ShopperOrders.schemas['ProductItem'];
type OmsReasonCode = ShopperOrders.schemas['OmsReasonCode'];

function groupProductItemsByShipmentId(productItems: ProductItem[]): Record<string, ProductItem[]> {
    return productItems.reduce<Record<string, ProductItem[]>>((itemsByShipmentId, item) => {
        const shipmentId = item.shipmentId ?? 'default';
        if (!itemsByShipmentId[shipmentId]) itemsByShipmentId[shipmentId] = [];
        itemsByShipmentId[shipmentId].push(item);
        return itemsByShipmentId;
    }, {});
}

/** Raw `order.status` when it is not a known SCAPI enum value in {@link getOrderStatusConfig}. */
function orderStatusFallbackLabel(status: string | undefined): string {
    return formatStatusFallbackLabel(status);
}

function ShipmentShippingStatusBadge({
    shippingStatus,
    t,
}: {
    shippingStatus: string | undefined;
    t: ReturnType<typeof useTranslation>['t'];
}): ReactElement | null {
    const trimmed = shippingStatus?.trim() ?? '';
    const config = getShippingStatusConfig(shippingStatus);
    if (!config && !trimmed) {
        return null;
    }
    return (
        <Badge
            data-testid="shipping-status-badge"
            className={cn(BADGE_BASE_CLASSES, config?.className ?? 'border-transparent bg-muted text-foreground')}>
            {config ? t(config.labelKey) : formatStatusFallbackLabel(trimmed)}
        </Badge>
    );
}

type PaymentMethodDisplay = { id: string; label: string };

function getPaymentMethodDisplays(
    order: ShopperOrders.schemas['Order'],
    t: ReturnType<typeof useTranslation>['t']
): PaymentMethodDisplay[] {
    const instruments = order.paymentInstruments ?? [];
    return instruments.flatMap((instrument, index) => {
        const card = instrument.paymentCard;
        if (!card?.numberLastDigits) return [];
        const id = instrument.paymentInstrumentId ?? `payment-${index}`;
        const cardType = card.cardType ?? 'Card';
        const label = t('orders.paymentMethodEndingIn', {
            cardType,
            lastDigits: card.numberLastDigits,
        });
        return [{ id, label }];
    });
}

function orderReviewStorageKey(orderNo: string | undefined): string {
    return `orderReviewSubmittedLines:${orderNo ?? ''}`;
}

/**
 * The "Return Items" button, rendered once the deferred `omsMetaData` resolves. Hidden entirely
 * when `omsActive` is `false` (409 — OMS not active for this org).
 *
 * When nothing is currently returnable (e.g. every item has been fully returned) — or after a
 * successful cancel (`forceDisabled`) — the button renders **disabled** rather than being hidden,
 * matching PWA Kit's Order Details action bar. It uses `aria-disabled` + a click-guard instead of
 * the native `disabled` attribute so it stays focusable for screen readers, with an adjacent
 * visually-hidden reason linked via `aria-describedby`.
 *
 * It lifts the resolved reason codes up to {@link ReturnItemsAction} via `onReasonsResolved` so
 * the dialog can be rendered *outside* this Await boundary — see the note in `ReturnItemsAction`.
 */
function ReturnItemsButton({
    order,
    metaData,
    onReasonsResolved,
    forceDisabled,
    onOpen,
    buttonRef,
}: {
    order: ShopperOrders.schemas['Order'];
    metaData: OmsMetaDataResult;
    onReasonsResolved: (reasonCodes: OmsReasonCode[]) => void;
    forceDisabled?: boolean;
    onOpen: () => void;
    buttonRef?: RefObject<HTMLButtonElement | null>;
}): ReactElement | null {
    const { t } = useTranslation('account');

    const { returnReasonCodes } = metaData;
    // Each `<Await>` re-resolve (e.g. a "Try again" revalidation) yields a fresh array reference even
    // when the codes are unchanged. Gate the parent sync on a content signature so an identical
    // re-resolve doesn't push a new array up and re-render the dialog for nothing.
    const reasonCodesSignature = useMemo(() => returnReasonCodes.map((r) => r.reason).join('|'), [returnReasonCodes]);
    useEffect(() => {
        onReasonsResolved(returnReasonCodes);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- onReasonsResolved is a stable state setter; resync only when the resolved reason codes actually change (signature-gated, not reference-gated)
    }, [reasonCodesSignature]);

    if (!metaData.omsActive) {
        return null;
    }

    // Nothing returnable (or forced off after a successful cancel) → disabled button, not hidden
    // (PWA Kit parity). `aria-disabled` + click-guard keeps it focusable for screen readers, with
    // the reason linked via `aria-describedby`.
    const disabled = getReturnableItems(order).length === 0 || !!forceDisabled;
    return (
        <>
            <Button
                ref={buttonRef}
                type="button"
                variant="outline"
                size="sm"
                className="w-full sm:w-auto aria-disabled:pointer-events-none aria-disabled:opacity-50"
                aria-disabled={disabled || undefined}
                aria-describedby={disabled ? 'return-items-unavailable-reason' : undefined}
                onClick={() => {
                    if (disabled) {
                        return;
                    }
                    onOpen();
                }}>
                {t('orders.returnItems')}
            </Button>
            {disabled && (
                <span id="return-items-unavailable-reason" className="sr-only">
                    {t('orders.returnUnavailable')}
                </span>
            )}
        </>
    );
}

/**
 * "Return Items" entry point + eligibility gate. Renders only when the shopper is registered,
 * owns the order, and the order has OMS data (see {@link isOrderOwnedBy}).
 *
 * The button and the dialog are deliberately split into **sibling** Suspense boundaries. The
 * dialog's "Try again" (reasons-unavailable) action revalidates the loader, which produces a new
 * `omsMetaData` promise and re-suspends the button's `<Await>`. Keeping the dialog outside that
 * boundary — fed from `returnReasonCodes` state that `ReturnItemsButton` lifts up — means the open
 * dialog stays mounted (view / selections / focus survive) and simply re-renders when fresh reason
 * codes arrive, instead of unmounting mid-interaction.
 */
function ReturnItemsAction({
    order,
    omsMetaData,
    forceDisabled,
    fallbackFocusRef,
}: {
    order: ShopperOrders.schemas['Order'];
    omsMetaData: Promise<OmsMetaDataResult>;
    forceDisabled?: boolean;
    /**
     * Stable focus target used when the "Return Items" button is temporarily unmounted while the
     * dialog is open (e.g. an `omsMetaData` revalidation re-suspends the button's Await boundary).
     * Owned by the Order Details header, which lives outside this Suspense boundary.
     */
    fallbackFocusRef?: RefObject<HTMLElement | null>;
}): ReactElement | null {
    const auth = useAuth();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogLoaded, setDialogLoaded] = useState(false);
    const [returnReasonCodes, setReturnReasonCodes] = useState<OmsReasonCode[] | null>(null);
    const returnButtonRef = useRef<HTMLButtonElement | null>(null);

    const eligible = !!auth?.customerId && isOrderOwnedBy(order, auth.customerId) && !!order.omsData;

    if (!eligible) {
        return null;
    }

    return (
        <>
            <Suspense fallback={null}>
                <Await resolve={omsMetaData}>
                    {(metaData) => (
                        <ReturnItemsButton
                            order={order}
                            metaData={metaData}
                            onReasonsResolved={setReturnReasonCodes}
                            forceDisabled={forceDisabled}
                            onOpen={() => {
                                setDialogLoaded(true);
                                setDialogOpen(true);
                            }}
                            buttonRef={returnButtonRef}
                        />
                    )}
                </Await>
            </Suspense>
            {dialogLoaded && returnReasonCodes !== null && (
                <Suspense fallback={null}>
                    <ReturnOrderDialog
                        order={order}
                        returnReasonCodes={returnReasonCodes}
                        open={dialogOpen}
                        onOpenChange={setDialogOpen}
                        triggerRef={returnButtonRef}
                        fallbackFocusRef={fallbackFocusRef}
                    />
                </Suspense>
            )}
        </>
    );
}

/**
 * "Cancel Order" button, rendered once the deferred `omsMetaData` resolves. Hidden entirely
 * when `omsActive` is `false` (409 — OMS not active for this org).
 *
 * When the order can no longer be cancelled (not eligible, already cancelled, or forced off after
 * a successful cancel) the button renders **disabled** rather than being hidden, matching PWA Kit.
 * Uses `aria-disabled` + a click-guard so it stays focusable, with the reason linked via
 * `aria-describedby`.
 *
 * Lifts the resolved cancel reason codes up to {@link CancelItemsAction} via `onReasonsResolved`
 * so the dialog can be rendered *outside* this Await boundary (same pattern as Return).
 */
function CancelOrderButton({
    order,
    metaData,
    onReasonsResolved,
    forceDisabled,
    onOpen,
    buttonRef,
}: {
    order: ShopperOrders.schemas['Order'];
    metaData: OmsMetaDataResult;
    onReasonsResolved: (reasonCodes: OmsReasonCode[]) => void;
    forceDisabled?: boolean;
    onOpen: () => void;
    buttonRef?: RefObject<HTMLButtonElement | null>;
}): ReactElement | null {
    const { t } = useTranslation('account');
    const auth = useAuth();

    const { cancelReasonCodes } = metaData;
    const reasonCodesSignature = useMemo(() => cancelReasonCodes.map((r) => r.reason).join('|'), [cancelReasonCodes]);
    useEffect(() => {
        onReasonsResolved(cancelReasonCodes);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- onReasonsResolved is a stable state setter; resync only when the resolved reason codes actually change
    }, [reasonCodesSignature]);

    if (!metaData.omsActive) {
        return null;
    }

    const eligible = canCancelOrder(order, auth?.customerId);
    const cancelled = isOrderCancelled(order);
    const disabled = !eligible || cancelled || !!forceDisabled;

    return (
        <>
            <Button
                ref={buttonRef}
                type="button"
                variant="outline"
                size="sm"
                className="w-full sm:w-auto aria-disabled:pointer-events-none aria-disabled:opacity-50"
                aria-disabled={disabled || undefined}
                aria-describedby={disabled ? 'cancel-order-unavailable-reason' : undefined}
                onClick={() => {
                    if (disabled) {
                        return;
                    }
                    onOpen();
                }}>
                {t('orders.cancelOrder')}
            </Button>
            {disabled && (
                <span id="cancel-order-unavailable-reason" className="sr-only">
                    {t('orders.cancelUnavailable')}
                </span>
            )}
        </>
    );
}

/**
 * "Cancel Order" entry point + eligibility gate. Renders only when the shopper is registered,
 * owns the order, and the order has OMS data. Mirrors {@link ReturnItemsAction} architecture.
 */
function CancelItemsAction({
    order,
    omsMetaData,
    cancelTerminal,
    cancelSucceeded,
    onSettled,
    onDialogOpen,
    fallbackFocusRef,
}: {
    order: ShopperOrders.schemas['Order'];
    omsMetaData: Promise<OmsMetaDataResult>;
    cancelTerminal: boolean;
    cancelSucceeded: boolean;
    onSettled: (result: CancelActionResult) => void;
    onDialogOpen: () => void;
    /**
     * Stable focus target used when the "Cancel Order" button unmounts while the dialog is open
     * (e.g. it returns null after a successful cancel). Owned by the Order Details header, which
     * lives outside this Suspense boundary. Prevents focus dropping to `<body>` on dialog close.
     */
    fallbackFocusRef?: RefObject<HTMLElement | null>;
}): ReactElement | null {
    const auth = useAuth();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogLoaded, setDialogLoaded] = useState(false);
    const [cancelReasonCodes, setCancelReasonCodes] = useState<OmsReasonCode[] | null>(null);
    const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

    const eligible = !!auth?.customerId && isOrderOwnedBy(order, auth.customerId) && !!order.omsData;

    if (!eligible) {
        return null;
    }

    const forceDisabled = cancelSucceeded || cancelTerminal;

    return (
        <>
            <Suspense fallback={null}>
                <Await resolve={omsMetaData}>
                    {(metaData) => (
                        <CancelOrderButton
                            order={order}
                            metaData={metaData}
                            onReasonsResolved={setCancelReasonCodes}
                            forceDisabled={forceDisabled}
                            onOpen={() => {
                                setDialogLoaded(true);
                                setDialogOpen(true);
                                onDialogOpen();
                            }}
                            buttonRef={cancelButtonRef}
                        />
                    )}
                </Await>
            </Suspense>
            {dialogLoaded && cancelReasonCodes !== null && (
                <Suspense fallback={null}>
                    <CancelOrderDialog
                        orderNo={order.orderNo ?? ''}
                        cancelReasonCodes={cancelReasonCodes}
                        open={dialogOpen}
                        onOpenChange={setDialogOpen}
                        onSettled={onSettled}
                        triggerRef={cancelButtonRef}
                        fallbackFocusRef={fallbackFocusRef}
                    />
                </Suspense>
            )}
        </>
    );
}

type CancelFeedback = { status: 'success' | 'error'; title: string; description: string };

export function OrderDetails({ order, productsById, omsMetaData }: OrderDetailsProps): ReactElement {
    const { t } = useTranslation('account');
    const orderNo = order.orderNo ?? '';
    const [submittedReviewLineKeys, setSubmittedReviewLineKeys] = useState<Set<string>>(() => new Set());
    const [cancelFeedback, setCancelFeedback] = useState<CancelFeedback | null>(null);
    const [cancelTerminal, setCancelTerminal] = useState(false);
    const [cancelSucceeded, setCancelSucceeded] = useState(false);
    const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleCancelSettled = useCallback(
        (result: CancelActionResult) => {
            if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);

            // Apply durable state synchronously so the button disables immediately
            if (result.success) {
                setCancelSucceeded(true);
            } else {
                const status = result.error?.status;
                if (status === 404 || status === 409) setCancelTerminal(true);
            }

            // Defer the alert render so screen readers finish the dialog close announcement
            feedbackTimerRef.current = setTimeout(() => {
                if (result.success) {
                    setCancelFeedback({
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
                    setCancelFeedback({ status: 'error', title, description });
                }
            }, ANNOUNCE_DELAY_MS);
        },
        [t]
    );

    useEffect(() => {
        return () => {
            if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
        };
    }, []);

    useEffect(() => {
        if (typeof sessionStorage === 'undefined' || !orderNo) {
            return;
        }
        try {
            const raw = sessionStorage.getItem(orderReviewStorageKey(orderNo));
            if (!raw) {
                return;
            }
            const parsed = JSON.parse(raw) as unknown;
            if (Array.isArray(parsed)) {
                setSubmittedReviewLineKeys(
                    new Set(parsed.filter((x): x is string => typeof x === 'string' && x.length > 0))
                );
            }
        } catch {
            /* ignore corrupt storage */
        }
    }, [orderNo]);

    const handleOrderLineReviewSubmitted = useCallback(
        (lineKey: string) => {
            setSubmittedReviewLineKeys((prev) => {
                const next = new Set(prev);
                next.add(lineKey);
                try {
                    if (typeof sessionStorage !== 'undefined' && orderNo) {
                        sessionStorage.setItem(orderReviewStorageKey(orderNo), JSON.stringify([...next]));
                    }
                } catch {
                    /* ignore quota */
                }
                return next;
            });
        },
        [orderNo]
    );

    // Fallback focus target for the return dialog: the Order Details heading. Used when the
    // "Return Items" button unmounts mid-open (e.g. an `omsMetaData` revalidation re-suspends the
    // button's Await boundary and the shopper closes the dialog before the button re-mounts).
    // The heading gets `tabIndex={-1}` so it is programmatically focusable but stays out of the
    // tab order otherwise.
    const orderDetailsHeadingRef = useRef<HTMLHeadingElement | null>(null);
    const shipments = order.shipments ?? [];
    const productItems = order.productItems ?? [];
    // Derived order-level statuses (aggregated from item-level omsData.status).
    // Priority mirrors PWA Kit's OrderStatusBadge:
    //   cancel (item-level all-cancelled) → return (aggregated from items) → raw status.
    // The raw status uses the shared resolveOrderStatus (ECOM-first, OMS as fallback) so
    // this badge and the order-history list badge can never disagree for the same order —
    // distinct from the tracking mapper's OMS-preferred shipment *sourcing*. SCAPI's
    // Order.status can lag behind OMS (stays "created"/"new" while OMS reports "Approved"),
    // so resolveOrderStatus falls back to omsData.status when ECOM is silent. The
    // per-shipment shipping-status badge below stays ECOM — an OMS shipment has no join key
    // to a specific ECOM shipment, so OMS-enriching it would render data against the wrong one.
    const cancelStatusConfig = getOrderCancelStatusConfig(order);
    const returnStatusConfig = !cancelStatusConfig
        ? getOrderReturnStatusConfig(getOrderReturnStatus(order))
        : undefined;
    const orderStatus = resolveOrderStatus(order);
    const orderStatusConfig = getOrderStatusConfig(orderStatus);
    const orderStatusLabelFallback = orderStatusFallbackLabel(orderStatus);
    const showOrderStatusBadge =
        cancelStatusConfig || returnStatusConfig || orderStatusConfig || orderStatusLabelFallback;
    const OrderStatusIcon = orderStatusConfig?.icon === 'check' ? Check : orderStatusConfig?.icon === 'x' ? X : null;
    const itemsByShipmentId = groupProductItemsByShipmentId(productItems);
    const paymentMethodDisplays = getPaymentMethodDisplays(order, t);
    // Whether the order has a card to show in the tracking section. Gate on the SAME
    // predicate OrderTracking uses to render a card (hasVisibleTrackingCard), not the
    // looser hasDisplayableTracking: an entry with only a trackingUrl is displayable but
    // has no card-visible content, so the looser gate would mount the heading + wrapper
    // over an OrderTracking that renders null — an orphan heading above an empty div.
    const hasTracking = getOrderTrackingEntries(order).some(hasVisibleTrackingCard);
    // Top Order-Actions "Track Shipment" affordance: the list of externalizable carrier
    // links (>1 → dropdown) and the single-target fallback (1 link → deep-link, else the
    // in-page tracking anchor). Both come from the same source as the tracking cards, so
    // the top action and the cards can never diverge. When there is no usable target the
    // action renders nothing and the actions row collapses (empty:hidden).
    const trackShipmentTargets = getTrackShipmentTargets(order);
    const trackShipmentTarget = getTrackShipmentHref(order);

    return (
        <div data-section="order-details">
            {/* Single bordered container for the whole order details component */}
            <Card className="">
                <CardContent className="px-6 pt-0 pb-6 space-y-6">
                    {/* Cancel feedback alert — above the Order Details heading (matches PWA Kit).
                       Single live-region wrapper; inner Alert uses role="presentation" to avoid double-announcement. */}
                    <div aria-live="assertive" aria-atomic="true">
                        {cancelFeedback && (
                            <Alert
                                role="presentation"
                                variant={cancelFeedback.status === 'error' ? 'destructive' : 'default'}
                                data-testid="cancel-order-feedback">
                                <AlertTitle>{cancelFeedback.title}</AlertTitle>
                                <AlertDescription>{cancelFeedback.description}</AlertDescription>
                            </Alert>
                        )}
                    </div>

                    {/* Order Details header */}
                    <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
                        <div>
                            <h1
                                ref={orderDetailsHeadingRef}
                                tabIndex={-1}
                                className="text-2xl font-semibold outline-none">
                                {t('orders.orderDetailsPageTitle')}
                            </h1>
                            <p
                                className="mt-1 flex items-center gap-0 text-base font-medium text-muted-foreground"
                                data-testid="order-number">
                                <Hash className="size-4 shrink-0" aria-hidden={true} />
                                <span>{order.orderNo}</span>
                            </p>
                        </div>
                        {cancelStatusConfig ? (
                            <Badge
                                data-testid="order-cancel-status-badge"
                                className={cn(BADGE_BASE_CLASSES, cancelStatusConfig.className)}>
                                <X
                                    data-testid="order-status-icon"
                                    className="mr-1 inline size-3.5"
                                    aria-hidden={true}
                                />
                                {t(cancelStatusConfig.labelKey)}
                            </Badge>
                        ) : returnStatusConfig ? (
                            <Badge
                                data-testid="order-return-status-badge"
                                className={cn(BADGE_BASE_CLASSES, returnStatusConfig.className)}>
                                {t(returnStatusConfig.labelKey)}
                            </Badge>
                        ) : showOrderStatusBadge ? (
                            <Badge
                                data-testid="order-status-badge"
                                className={cn(
                                    BADGE_BASE_CLASSES,
                                    orderStatusConfig?.className ?? ORDER_STATUS_BADGE_CLASS.success
                                )}>
                                {OrderStatusIcon ? (
                                    <OrderStatusIcon
                                        data-testid="order-status-icon"
                                        className="mr-1 inline size-3.5"
                                        aria-hidden={true}
                                    />
                                ) : null}
                                {orderStatusConfig ? t(orderStatusConfig.labelKey) : orderStatusLabelFallback}
                            </Badge>
                        ) : null}
                    </div>

                    {/* Order-level action bar (return / cancel / track shipment / support). Sits
                        directly under the header — matching the order-management design (PR #1911) —
                        rather than buried in the Order Summary right rail. empty:hidden collapses the
                        whole row when no action renders. */}
                    <div className="flex flex-wrap gap-2 empty:hidden" data-slot="order-actions">
                        <UITarget targetId="sfcc.myAccount.orderDetails.returns">
                            {omsMetaData && (
                                <ReturnItemsAction
                                    order={order}
                                    omsMetaData={omsMetaData}
                                    forceDisabled={cancelSucceeded}
                                    fallbackFocusRef={orderDetailsHeadingRef}
                                />
                            )}
                        </UITarget>
                        <UITarget targetId="sfcc.myAccount.orderDetails.cancel">
                            {omsMetaData && (
                                <CancelItemsAction
                                    order={order}
                                    omsMetaData={omsMetaData}
                                    cancelTerminal={cancelTerminal}
                                    cancelSucceeded={!!cancelSucceeded}
                                    onSettled={handleCancelSettled}
                                    onDialogOpen={() => {
                                        if (feedbackTimerRef.current) {
                                            clearTimeout(feedbackTimerRef.current);
                                            feedbackTimerRef.current = null;
                                        }
                                        setCancelFeedback(null);
                                    }}
                                    fallbackFocusRef={orderDetailsHeadingRef}
                                />
                            )}
                        </UITarget>
                        {trackShipmentTargets.length > 1 ? (
                            // More than one externalizable carrier link → a dropdown so the
                            // shopper picks which to open. We can't say which tracking maps to
                            // which shipment (OMS and ECOM shipments share no join key), so
                            // options are labeled by tracking number, not by contents.
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        data-slot="order-actions-track"
                                        data-testid="order-actions-track"
                                        className="w-full sm:w-auto">
                                        {t('orders.actions.trackShipment')}
                                        <ChevronDown className="size-3.5" aria-hidden={true} />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" data-testid="order-actions-track-options">
                                    {trackShipmentTargets.map((target, index) => {
                                        // Visible label omits "opens in a new tab"; the new-tab
                                        // affordance is conveyed to assistive tech via aria-label
                                        // (the ExternalLink icon is aria-hidden). getTrackOptionLabels
                                        // keeps the visible and aria strings in sync.
                                        const { label, ariaLabel } = getTrackOptionLabels(target, index, t);
                                        return (
                                            <DropdownMenuItem key={target.id} asChild>
                                                <a
                                                    href={target.href}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    data-testid="order-actions-track-option"
                                                    aria-label={ariaLabel}
                                                    className="cursor-pointer">
                                                    {label}
                                                    <ExternalLink className="size-3.5" aria-hidden={true} />
                                                </a>
                                            </DropdownMenuItem>
                                        );
                                    })}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : trackShipmentTarget ? (
                            // Exactly one usable target → an enabled single button. Deep-links to
                            // the carrier in a new tab when the target is an externalizable URL,
                            // otherwise to the in-page tracking section. Gating on a non-null
                            // trackShipmentTarget is deliberate: getTrackShipmentHref returns null for a
                            // displayable-but-not-card-visible entry (e.g. a shipment whose only field is
                            // an ensureExternalUrl-rejected trackingUrl), where the #order-tracking anchor
                            // never mounts — so those render nothing rather than link to an anchor that
                            // scrolls nowhere, and the row collapses via empty:hidden.
                            <Button
                                variant="outline"
                                size="sm"
                                asChild
                                data-slot="order-actions-track"
                                data-testid="order-actions-track"
                                className="w-full sm:w-auto">
                                <a
                                    href={trackShipmentTarget.href}
                                    {...(trackShipmentTarget.external
                                        ? {
                                              target: '_blank',
                                              rel: 'noopener noreferrer',
                                              'aria-label': t('orders.actions.trackShipmentNewTab'),
                                          }
                                        : {})}>
                                    {t('orders.actions.trackShipment')}
                                    {trackShipmentTarget.external ? (
                                        <ExternalLink className="size-3.5" aria-hidden={true} />
                                    ) : null}
                                </a>
                            </Button>
                        ) : null}
                        <UITarget targetId="sfcc.myAccount.orderDetails.support" />
                    </div>
                    <div className="border-t border-muted-foreground/20" aria-hidden />

                    {/* Items Ordered and Order Summary */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-4">
                            <h2 className="text-lg font-semibold">{t('orders.itemsOrdered')}</h2>
                            <Card className="p-0 overflow-visible">
                                <CardContent className="p-0">
                                    {shipments.map((shipment, idx) => {
                                        const sid = shipment.shipmentId ?? `ship-${idx}`;
                                        const items = itemsByShipmentId[sid] ?? [];
                                        return (
                                            <div
                                                key={sid}
                                                data-shipment-id={sid}
                                                className={idx > 0 ? 'border-t border-muted-foreground/20' : ''}>
                                                <div className="px-3 py-2 bg-muted flex flex-nowrap items-center justify-between gap-2">
                                                    <p className="text-sm min-w-0 font-medium">
                                                        {t('orders.shipmentNumber', {
                                                            n: String(idx + 1),
                                                        })}
                                                    </p>
                                                    <ShipmentShippingStatusBadge
                                                        shippingStatus={shipment.shippingStatus}
                                                        t={t}
                                                    />
                                                </div>
                                                <div className="p-3">
                                                    <OrderItemsList
                                                        items={items}
                                                        productsById={productsById}
                                                        orderNo={order.orderNo}
                                                        submittedReviewLineKeys={submittedReviewLineKeys}
                                                        onOrderLineReviewSubmitted={handleOrderLineReviewSubmitted}
                                                    />
                                                    <UITarget targetId="sfcc.myAccount.orderDetails.review" />
                                                </div>
                                                {/* Shipping Address for this shipment */}
                                                <div className="mt-2 border-t border-muted-foreground/20 pt-4 px-3 pb-3 mx-3">
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        {shipment.shippingAddress && (
                                                            <Card
                                                                className="rounded-ui  min-h-[4rem] p-0 bg-card"
                                                                data-card="shipping-address">
                                                                <CardContent className="p-3">
                                                                    <p className="text-xs font-semibold text-foreground">
                                                                        {t('orders.shippingAddress')}
                                                                    </p>
                                                                    <div className="mt-2">
                                                                        <ShippingAddressDisplay
                                                                            address={shipment.shippingAddress}
                                                                        />
                                                                    </div>
                                                                    {shipment.shippingMethod?.name && (
                                                                        <p className="mt-2 text-sm text-muted-foreground">
                                                                            {shipment.shippingMethod.name}
                                                                        </p>
                                                                    )}
                                                                </CardContent>
                                                            </Card>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </CardContent>
                            </Card>

                            {/* Shipment tracking (OMS-preferred, ECOM fallback). The Track Shipment
                                affordance lives in the top order-actions row, not here. */}
                            {hasTracking ? (
                                <div className="space-y-3">
                                    <UITarget targetId="sfcc.myAccount.orderDetails.tracking" />
                                    <OrderTracking order={order} />
                                </div>
                            ) : null}
                        </div>
                        {/* Order Summary – OrderSummary accepts both Basket and Order for totals */}
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold">{t('orders.orderSummary')}</h3>
                            <UITarget targetId="sfcc.myAccount.orderDetails.tax">
                                <OrderSummary basket={order} showCartItems={false} showHeading={false} />
                            </UITarget>
                            {paymentMethodDisplays.length > 0 && (
                                <div className="space-y-1.5">
                                    <p className="text-xs font-semibold text-foreground">{t('orders.paymentMethod')}</p>
                                    <Card className="rounded-ui p-0 bg-card" data-card="payment-method">
                                        <CardContent className="p-3 py-2">
                                            <ul className="text-sm font-medium text-muted-foreground space-y-1 list-none">
                                                {paymentMethodDisplays.map(({ id, label }) => (
                                                    <li key={id}>{label}</li>
                                                ))}
                                            </ul>
                                        </CardContent>
                                    </Card>
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export default OrderDetails;
