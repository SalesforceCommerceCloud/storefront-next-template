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
    type ReactNode,
    type RefObject,
    useEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from 'react';
import { useFetcher } from 'react-router';
import { useTranslation } from 'react-i18next';
import defaultTheme from 'tailwindcss/defaultTheme';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { ShopperOrders, ShopperProducts } from '@/scapi';
import type { OrderLike } from '@/lib/order-management/types';
import {
    buildReturnProductItems,
    getReturnableItems,
    type ReturnSelection,
    type ReturnableItem,
} from '@/lib/order-management/return';
import type { ReturnErrorKind } from '@/lib/order-management/return-error';
import { getDisplayVariationValues } from '@/lib/product/product-utils';
import { useToast } from '@/components/toast';

type OmsReasonCode = ShopperOrders.schemas['OmsReasonCode'];

export type ReturnOrderDialogProps = {
    order: OrderLike;
    /** Reason codes from the OMS metadata loader. Empty when the metadata fetch degraded (5xx/network). */
    returnReasonCodes: OmsReasonCode[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /**
     * Element to receive focus when the dialog closes. Radix only auto-restores focus when it
     * owns the trigger, and this dialog is controlled (no `<DialogTrigger>`); without an
     * explicit target focus lands on `document.body`.
     */
    triggerRef?: RefObject<HTMLButtonElement | null>;
    /**
     * Fallback focus target used when `triggerRef.current` is null (e.g. the button unmounted
     * mid-open during an `omsMetaData` revalidation). Should be a stable landmark that lives
     * outside the trigger's Suspense boundary.
     */
    fallbackFocusRef?: RefObject<HTMLElement | null>;
};

type ReturnDialogView = 'select' | 'review';

type ActionSuccess = { success: true };
type ActionFailure = { success: false; error?: { kind?: ReturnErrorKind; status?: number } };
type ActionResponse = ActionSuccess | ActionFailure;

/**
 * Error kinds that carry a per-item recovery affordance: the shopper is sent back
 * to the selection view so they can fix the offending row (stale reason, vanished
 * item, or over-max quantity). React Router auto-revalidates the order/reason
 * loaders after the failed submission, so the reconciliation effect refreshes the
 * steppers/reasons — we don't call `revalidate()` explicitly here.
 */
const RECOVERABLE_SELECT_KINDS = new Set<ReturnErrorKind>(['invalid_reason', 'unknown_items', 'quantity_exceeded']);

/**
 * Terminal error kinds: the order can't be returned (404/409). The review-view
 * banner stays and the Submit button is disabled — retrying the same request is
 * pointless.
 */
const TERMINAL_KINDS = new Set<ReturnErrorKind>(['not_found', 'not_returnable']);

/**
 * Build the initial one-row-per-returnable-item selection state, unchecked, quantity 1.
 * Seeds `reason` with the resolved default so a row is never submittable with an empty
 * reason — even when the OMS returns codes but none is flagged `default: true`.
 */
function buildInitialSelections(items: ReturnableItem[], defaultReason?: string): ReturnSelection[] {
    return items.map((item) => ({
        itemId: item.itemId ?? '',
        checked: false,
        quantity: 1,
        reason: defaultReason ?? '',
    }));
}

/** Translated message keys for each classified return failure (see {@link classifyReturnError}). */
type ReturnErrorMessageKey =
    | 'orders.returnError400InvalidReasonMessage'
    | 'orders.returnError400UnknownItemsMessage'
    | 'orders.returnError400QuantityMessage'
    | 'orders.returnError404Message'
    | 'orders.returnError409Message'
    | 'orders.returnErrorGenericMessage';

/** Map a classified return failure to its translated message key. */
function returnErrorMessageKey(error: ActionFailure['error']): ReturnErrorMessageKey {
    switch (error?.kind) {
        case 'invalid_reason':
            return 'orders.returnError400InvalidReasonMessage';
        case 'unknown_items':
            return 'orders.returnError400UnknownItemsMessage';
        case 'quantity_exceeded':
            return 'orders.returnError400QuantityMessage';
        case 'not_found':
            return 'orders.returnError404Message';
        case 'not_returnable':
            return 'orders.returnError409Message';
        // invalid_input / transient / anything unrecognized → generic retryable message.
        default:
            return 'orders.returnErrorGenericMessage';
    }
}

/**
 * Display name (product name + variation attrs), joined text-only — no thumbnail, no SKU.
 *
 * `ReturnableItem` (`OrderProductItem`) only types `variationAttributes`/`variationValues` via its
 * generic `{ [key: string]: unknown }` index signature (SCAPI doesn't declare them on the order
 * `ProductItem` schema the way it does on `ShopperProducts.Product`) — cast to the shape
 * {@link getDisplayVariationValues} expects, same fields PWA Kit's order return UI reads off the
 * order response.
 */
function itemDisplayLine(item: ReturnableItem): string {
    const variationAttributes = item.variationAttributes as ShopperProducts.schemas['VariationAttribute'][] | undefined;
    const variationValues = item.variationValues as Record<string, string> | undefined;
    const displayValues = getDisplayVariationValues(variationAttributes, variationValues);
    const variationText = Object.entries(displayValues)
        .map(([name, value]) => `${name}: ${value}`)
        .join(', ');
    const name = item.productName ?? '';
    return variationText ? `${name} (${variationText})` : name;
}

function maxQuantityFor(item: ReturnableItem): number {
    const qty = item.omsData?.quantityAvailableToReturn;
    return typeof qty === 'number' && Number.isFinite(qty) && qty > 0 ? qty : 1;
}

/** Tailwind `md` breakpoint — below it the return flow presents as a bottom-sheet Drawer, at/above it a centered Dialog. */
const DESKTOP_MEDIA_QUERY = `(min-width: ${defaultTheme.screens.md})`;

function subscribeToDesktopQuery(callback: () => void) {
    const mql = globalThis.matchMedia?.(DESKTOP_MEDIA_QUERY);
    mql?.addEventListener('change', callback);
    return () => mql?.removeEventListener('change', callback);
}

/** Client snapshot: true at/above `md`, false below. Defaults to desktop when `matchMedia` is unavailable. */
function getIsDesktopSnapshot(): boolean {
    return globalThis.matchMedia?.(DESKTOP_MEDIA_QUERY)?.matches ?? true;
}

/** Server snapshot: assume desktop (Dialog). The dialog is closed at first paint and only opens post-hydration, so there is no shell flash. */
function getIsDesktopServerSnapshot(): boolean {
    return true;
}

/**
 * Present the return flow as a centered {@link Dialog} at Tailwind's `md` breakpoint and up, and a
 * full-height bottom-sheet {@link Drawer} below it — mirroring PWA Kit's `ReturnItemsModal`
 * (`useBreakpointValue({ base: true, md: false })`). Hydration-safe via a shared `matchMedia`
 * subscription with a desktop server snapshot (follows the `useSwatchMode` precedent in `product-tile/context.tsx`).
 */
function useIsDesktop(): boolean {
    return useSyncExternalStore(subscribeToDesktopQuery, getIsDesktopSnapshot, getIsDesktopServerSnapshot);
}

/**
 * Return selection + review dialog for an OMS order. Single shadcn `<Dialog>` with a local
 * `view` state (`'select' | 'review'`) swapped in place — no remount, so focus stays trapped
 * across the transition (see spec "Return Dialog — single dialog, two views").
 *
 * Reason codes arrive already resolved from the order-detail loader's deferred `omsMetaData`
 * promise (see `index.tsx`'s inner `Suspense`/`Await`); this component never fetches them.
 * When `returnReasonCodes` is empty (a degraded metadata fetch), the reason select is hidden
 * and the Review button stays enabled — the SCAPI `reason` field is optional and the server
 * applies its default reason code when absent (see `buildReturnPayload`).
 */
export function ReturnOrderDialog({
    order,
    returnReasonCodes,
    open,
    onOpenChange,
    triggerRef,
    fallbackFocusRef,
}: ReturnOrderDialogProps): ReactElement {
    const { t } = useTranslation('account');
    const fetcher = useFetcher<ActionResponse>();
    const { addToast } = useToast();

    const returnableItems = useMemo(() => getReturnableItems(order), [order]);
    // Prefer the OMS-flagged default; fall back to the first code so a checked row
    // always has a concrete reason even when no code is marked `default: true`.
    const defaultReasonCode = returnReasonCodes.find((r) => r.default)?.reason ?? returnReasonCodes[0]?.reason;
    const reasonsUnavailable = returnReasonCodes.length === 0;

    const [view, setView] = useState<ReturnDialogView>('select');
    const [selections, setSelections] = useState<ReturnSelection[]>(() =>
        buildInitialSelections(returnableItems, defaultReasonCode)
    );

    // Move focus to the active view's title whenever the view swaps (select <-> review). Because
    // the dialog never remounts across the swap, focus would otherwise stay on the now-hidden
    // button, leaving screen-reader users unaware the content changed. `open` is a dep so focus
    // also lands on the title when the dialog first opens.
    const titleRef = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
        if (open) {
            titleRef.current?.focus();
        }
    }, [view, open]);

    const itemsById = useMemo(() => {
        const map = new Map<string, ReturnableItem>();
        returnableItems.forEach((item) => {
            if (item.itemId) {
                map.set(item.itemId, item);
            }
        });
        return map;
    }, [returnableItems]);

    // Holds the failed `fetcher.data` the shopper has already acted on. Once they edit a row
    // (fixing the quantity/reason that triggered a recoverable-400), the banner for that response
    // is stale, so we suppress it until the next submission produces a fresh `fetcher.data`.
    // A ref (not state) is enough: every edit goes through `setSelections`, which re-renders anyway.
    const dismissedErrorRef = useRef<ActionResponse | undefined>(undefined);

    const isSubmitting = fetcher.state !== 'idle';
    // A settled submission that failed: surface a translated banner + pick recovery.
    // Cleared while a fresh submission is in flight so the stale error doesn't linger, and once the
    // shopper edits a row (see `dismissedErrorRef`) so a fixed input doesn't keep the stale message.
    const submitError =
        !isSubmitting && fetcher.data && !fetcher.data.success && fetcher.data !== dismissedErrorRef.current
            ? fetcher.data.error
            : undefined;
    const errorKind = submitError?.kind;
    // Terminal (404/409): the order can't be returned — disable Submit, keep the banner in review.
    // Recoverable-400: the shopper is sent back to selection to fix the row (see the effect below).
    // Everything else (transient/invalid_input/unknown): retryable inline, Submit stays enabled.
    const isTerminalError = errorKind !== undefined && TERMINAL_KINDS.has(errorKind);

    /** Reset all local state (view + selections) — called on close so re-opening starts fresh. */
    function resetState() {
        setView('select');
        setSelections(buildInitialSelections(returnableItems, defaultReasonCode));
    }

    function handleOpenChange(next: boolean) {
        if (!next) {
            resetState();
        }
        onOpenChange(next);
    }

    function patchSelection(itemId: string, patch: Partial<ReturnSelection>) {
        setSelections((prev) => prev.map((s) => (s.itemId === itemId ? { ...s, ...patch } : s)));
    }

    function updateSelection(itemId: string, patch: Partial<ReturnSelection>) {
        // Editing a row's quantity/reason acknowledges (and dismisses) the current recoverable-error
        // banner: the input that triggered it may now be fixed, so a lingering "quantity exceeds
        // available" is stale. Checkbox toggles go through `patchSelection` instead — they don't fix
        // the offending input, and dismissing there would wrongly hide the review banner the shopper
        // reaches by checking a row after a terminal/transient failure.
        dismissedErrorRef.current = fetcher.data ?? undefined;
        patchSelection(itemId, patch);
    }

    function toggleChecked(itemId: string, checked: boolean) {
        patchSelection(itemId, checked ? { checked: true } : { checked: false });
    }

    const checkedSelections = selections.filter((s) => s.checked);
    const canReview =
        checkedSelections.length > 0 &&
        checkedSelections.every((s) => {
            const item = itemsById.get(s.itemId);
            const max = item ? maxQuantityFor(item) : 0;
            const qty = Number(s.quantity);
            // Reason validation only applies when the OMS surfaced codes. When the metadata fetch
            // degraded (`reasonsUnavailable`), the shopper submits without a reason and the SCAPI
            // server fills in its default — the `reason` field in the payload is optional.
            // `||` not `??`: a row seeded while reason codes were unavailable holds `reason: ''`,
            // which must fall through to the now-resolved default once a loader revalidation resolves reasons.
            const hasReason = reasonsUnavailable || !!(s.reason || defaultReasonCode);
            return hasReason && Number.isFinite(qty) && qty > 0 && qty <= max;
        });

    function handleReview() {
        setView('review');
    }

    function handleBack() {
        setView('select');
    }

    function handleSubmit() {
        if (isSubmitting) {
            return;
        }
        const productItems = buildReturnProductItems(selections, defaultReasonCode);
        const formData = new FormData();
        formData.set('orderNo', order.orderNo ?? '');
        formData.set('productItems', JSON.stringify(productItems));
        void fetcher.submit(formData, { method: 'post', action: '/action/return-order' });
    }

    // React to a settled submission. Keyed on `fetcher.data` so it runs once per response.
    // - Success: show the confirmation toast and close. The fetcher submission already triggers
    //   loader revalidation automatically; do NOT call revalidator.revalidate() (double revalidation).
    // - Recoverable-400 (invalid_reason/unknown_items/quantity_exceeded): send the shopper back to
    //   the selection view to fix the offending row. The failed submission auto-revalidates the
    //   order/reason loaders too, so the reconciliation effect below refreshes steppers/reasons.
    //   For invalid_reason, clear the stale reason on checked rows so the refreshed list re-seeds.
    useEffect(() => {
        const result = fetcher.data;
        if (!result || open === false) {
            return;
        }
        if (result.success) {
            addToast(t('orders.returnSuccessTitle'), 'success', {
                description: t('orders.returnSuccessMessage'),
            });
            handleOpenChange(false);
            return;
        }
        const kind = result.error?.kind;
        if (kind !== undefined && RECOVERABLE_SELECT_KINDS.has(kind)) {
            setView('select');
            if (kind === 'invalid_reason') {
                setSelections((prev) => prev.map((s) => (s.checked ? { ...s, reason: undefined } : s)));
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- handleOpenChange/open/t/addToast intentionally excluded to avoid re-firing on every state reset
    }, [fetcher.data]);

    // Reconcile local selections to a freshly-revalidated order. After a successful or recoverable
    // return, the loader refetch decrements each returned item's quantityAvailableToReturn (fully
    // returned items leave getReturnableItems). Signature-guarded on the returnable set (itemId+max)
    // so it only runs when that set actually changes — never clobbering an in-progress edit while
    // the shopper is mid-selection. Drops selections for items no longer returnable and clamps each
    // surviving quantity to the new max, preserving checked/reason.
    const returnableSignature = useMemo(
        () => returnableItems.map((item) => `${item.itemId ?? ''}:${maxQuantityFor(item)}`).join('|'),
        [returnableItems]
    );
    const prevSignatureRef = useRef(returnableSignature);
    useEffect(() => {
        if (prevSignatureRef.current === returnableSignature) {
            return;
        }
        prevSignatureRef.current = returnableSignature;
        setSelections((prev) => {
            const bySelection = new Map(prev.map((s) => [s.itemId, s]));
            return returnableItems.map((item) => {
                const itemId = item.itemId ?? '';
                const existing = bySelection.get(itemId);
                const max = maxQuantityFor(item);
                const quantity = Math.min(Number(existing?.quantity ?? 1) || 1, max);
                return {
                    itemId,
                    checked: existing?.checked ?? false,
                    quantity,
                    reason: existing?.reason ?? defaultReasonCode ?? '',
                };
            });
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on returnableSignature; returnableItems/defaultReasonCode derive from it
    }, [returnableSignature]);

    // Pick the presentation shell by viewport: a centered Dialog at `md`+ and a bottom-sheet Drawer
    // below it. Both shells wrap the SAME view bodies (below) and share `view`/`selections` state, so
    // crossing the breakpoint — or swapping select<->review — never remounts and never drops edits.
    const isDesktop = useIsDesktop();
    const Shell = isDesktop ? Dialog : Drawer;
    const ShellContent = isDesktop ? DialogContent : DrawerContent;
    const ShellHeader = isDesktop ? DialogHeader : DrawerHeader;
    const ShellTitle = isDesktop ? DialogTitle : DrawerTitle;
    const ShellDescription = isDesktop ? DialogDescription : DrawerDescription;
    const ShellFooter = isDesktop ? DialogFooter : DrawerFooter;
    const ShellClose = isDesktop ? DialogClose : DrawerClose;

    // The Drawer content box has no built-in body padding (its Header/Footer carry their own), so the
    // scrollable middle needs horizontal padding + independent scroll on the sheet; the Dialog content
    // box already pads via `p-6` and sizes to content.
    const bodyClassName = isDesktop ? 'space-y-4' : 'flex-1 space-y-4 overflow-y-auto px-4 pb-2';

    const selectView: ReactNode = (
        <>
            <ShellHeader>
                <ShellTitle ref={titleRef} tabIndex={-1} className="outline-none">
                    {t('orders.returnDialogTitle', { orderNo: order.orderNo ?? '' })}
                </ShellTitle>
                <ShellDescription>{t('orders.returnDialogSubtitle')}</ShellDescription>
            </ShellHeader>
            <div className={bodyClassName}>
                {submitError && !isTerminalError ? (
                    <Alert variant="destructive" data-testid="return-recoverable-error">
                        <AlertTitle>{t('orders.returnErrorGenericTitle')}</AlertTitle>
                        <AlertDescription>{t(returnErrorMessageKey(submitError))}</AlertDescription>
                    </Alert>
                ) : null}
                <ul className="space-y-4" data-testid="return-item-rows">
                    {returnableItems.map((item) => {
                        const itemId = item.itemId ?? '';
                        const selection = selections.find((s) => s.itemId === itemId);
                        const checked = selection?.checked ?? false;
                        const max = maxQuantityFor(item);
                        const displayLine = itemDisplayLine(item);
                        return (
                            <li key={itemId} data-testid="return-item-row">
                                <div className="flex items-start gap-3">
                                    {/* No aria-label: the associated <label> below already supplies the
                                        accessible name (name + "available to return"). An aria-label would
                                        override it redundantly (WCAG SC 2.5.3, Label in Name). */}
                                    <Checkbox
                                        id={`return-item-${itemId}`}
                                        checked={checked}
                                        onCheckedChange={(value) => toggleChecked(itemId, value === true)}
                                    />
                                    <label htmlFor={`return-item-${itemId}`} className="flex-1 space-y-1">
                                        <p className="text-sm font-medium">{displayLine}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {t('orders.returnAvailableToReturn', { count: max })}
                                        </p>
                                    </label>
                                </div>
                                {checked && (
                                    <div className="mt-3 ml-7 grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
                                        <div>
                                            <label
                                                htmlFor={`return-quantity-${itemId}`}
                                                className="mb-1 block text-xs font-medium">
                                                {t('orders.returnQuantityLabel')}
                                            </label>
                                            <input
                                                id={`return-quantity-${itemId}`}
                                                type="number"
                                                min={1}
                                                max={max}
                                                step={1}
                                                value={selection?.quantity ?? 1}
                                                onChange={(e) => {
                                                    const raw = Number(e.target.value);
                                                    const clamped = Number.isFinite(raw)
                                                        ? Math.min(Math.max(raw, 1), max)
                                                        : 1;
                                                    updateSelection(itemId, { quantity: clamped });
                                                }}
                                                className="border-input h-9 w-full rounded-ui border bg-transparent px-3 py-2 text-sm shadow-ui outline-none"
                                            />
                                        </div>
                                        <div>
                                            {reasonsUnavailable ? (
                                                <span className="sr-only">{t('orders.returnReasonAutoAssigned')}</span>
                                            ) : (
                                                <>
                                                    <label
                                                        htmlFor={`return-reason-${itemId}`}
                                                        className="mb-1 block text-xs font-medium">
                                                        {t('orders.returnReasonFor', { name: displayLine })}
                                                    </label>
                                                    <NativeSelect
                                                        id={`return-reason-${itemId}`}
                                                        value={selection?.reason || defaultReasonCode || ''}
                                                        onChange={(e) =>
                                                            updateSelection(itemId, { reason: e.target.value })
                                                        }>
                                                        {returnReasonCodes.map((rc) => (
                                                            <NativeSelectOption key={rc.reason} value={rc.reason}>
                                                                {rc.reason}
                                                            </NativeSelectOption>
                                                        ))}
                                                    </NativeSelect>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </div>
            <ShellFooter>
                <ShellClose asChild>
                    <Button type="button" variant="outline">
                        {t('orders.returnCancelButton')}
                    </Button>
                </ShellClose>
                <Button type="button" disabled={!canReview} onClick={handleReview}>
                    {t('orders.returnReviewButton')}
                </Button>
            </ShellFooter>
        </>
    );

    const reviewView: ReactNode = (
        <>
            <ShellHeader>
                <ShellTitle ref={titleRef} tabIndex={-1} className="outline-none">
                    {t('orders.returnReviewTitle')}
                </ShellTitle>
                <ShellDescription>
                    {t(reasonsUnavailable ? 'orders.returnReviewSubtitleNoReasons' : 'orders.returnReviewSubtitle')}
                </ShellDescription>
            </ShellHeader>
            <div className={bodyClassName}>
                <ul className="space-y-4" data-testid="return-review-rows">
                    {checkedSelections.map((selection) => {
                        const item = itemsById.get(selection.itemId);
                        if (!item) {
                            return null;
                        }
                        const displayLine = itemDisplayLine(item);
                        const reasonLabel = selection.reason || defaultReasonCode || '';
                        return (
                            <li key={selection.itemId} className="space-y-1" data-testid="return-review-row">
                                <p className="text-sm font-medium">{displayLine}</p>
                                <p className="text-xs text-muted-foreground">
                                    {t('orders.returnReviewQuantity', { count: Number(selection.quantity) })}
                                </p>
                                {reasonsUnavailable ? null : (
                                    <p className="text-xs text-muted-foreground">
                                        {t('orders.returnReviewReason', { reason: reasonLabel })}
                                    </p>
                                )}
                            </li>
                        );
                    })}
                </ul>
                {submitError ? (
                    <Alert variant="destructive" data-testid="return-submit-error">
                        <AlertTitle>{t('orders.returnErrorGenericTitle')}</AlertTitle>
                        <AlertDescription>{t(returnErrorMessageKey(submitError))}</AlertDescription>
                    </Alert>
                ) : null}
            </div>
            <ShellFooter>
                <Button type="button" variant="outline" onClick={handleBack}>
                    {t('orders.returnBackButton')}
                </Button>
                <Button type="button" disabled={isSubmitting || isTerminalError} onClick={handleSubmit}>
                    {t('orders.returnSubmitButton')}
                </Button>
            </ShellFooter>
        </>
    );

    return (
        <Shell open={open} onOpenChange={handleOpenChange}>
            <ShellContent
                className={isDesktop ? 'sm:max-w-lg' : 'max-h-[90vh]'}
                onCloseAutoFocus={(event) => {
                    const target = triggerRef?.current ?? fallbackFocusRef?.current;
                    if (target) {
                        event.preventDefault();
                        target.focus();
                    }
                }}>
                {view === 'select' ? selectView : reviewView}
            </ShellContent>
        </Shell>
    );
}

export default ReturnOrderDialog;
