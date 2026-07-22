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
import { useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
// eslint-disable-next-line import/no-namespace -- vi.spyOn requires namespace import
import * as ReactRouter from 'react-router';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { ReturnOrderDialog } from './return-order-dialog';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import type { ShopperOrders } from '@/scapi';
import type { OrderLike } from '@/lib/order-management/types';

const mockAddToast = vi.fn();
vi.mock('@/components/toast', () => ({
    useToast: () => ({ addToast: mockAddToast }),
}));

const { t } = getTranslation();

const mockOrder: OrderLike = {
    orderNo: 'INO001',
    productItems: [
        {
            itemId: 'item-1',
            productId: 'prod-1',
            productName: 'First Product',
            quantity: 2,
            omsData: { quantityAvailableToReturn: 2 },
        },
        {
            itemId: 'item-2',
            productId: 'prod-2',
            productName: 'Second Product',
            quantity: 1,
            omsData: { quantityAvailableToReturn: 0 },
        },
    ] as unknown as ShopperOrders.schemas['Order']['productItems'],
};

const returnReasonCodes: ShopperOrders.schemas['OmsReasonCode'][] = [
    { reason: 'Does not fit', default: true },
    { reason: 'Changed my mind', default: false },
];

const mockSubmit = vi.fn();
const mockRevalidate = vi.fn();

function mockUseFetcher(data: unknown = null, state: 'idle' | 'submitting' | 'loading' = 'idle') {
    vi.spyOn(ReactRouter, 'useFetcher').mockReturnValue({
        submit: mockSubmit,
        data,
        state,
    } as unknown as ReturnType<typeof ReactRouter.useFetcher>);
}

/**
 * Render the dialog with a "revalidate" button that swaps `order` from `mockOrder` to
 * `nextOrder` without remounting the dialog — mirrors how a loader revalidation feeds a
 * freshly-decremented order back through the `order` prop. Exercises the reconciliation effect.
 */
function renderReconcilingDialog(nextOrder: OrderLike) {
    // Captured setter so the test can swap the order prop from outside — the dialog is modal, so
    // an in-DOM button would be aria-hidden and unclickable; calling the setter directly is cleaner.
    let swapOrder: () => void = () => {};
    function Harness() {
        const [order, setOrder] = useState<OrderLike>(mockOrder);
        swapOrder = () => setOrder(nextOrder);
        return (
            <AllProvidersWrapper>
                <ReturnOrderDialog
                    order={order}
                    returnReasonCodes={returnReasonCodes}
                    open={true}
                    onOpenChange={vi.fn()}
                />
            </AllProvidersWrapper>
        );
    }
    const router = createMemoryRouter([{ path: '/', element: <Harness /> }], { initialEntries: ['/'] });
    const result = render(<RouterProvider router={router} />);
    return { ...result, revalidate: () => act(() => swapOrder()) };
}

function renderDialog(props: Partial<React.ComponentProps<typeof ReturnOrderDialog>> = {}) {
    const onOpenChange = vi.fn();
    const router = createMemoryRouter(
        [
            {
                path: '/',
                element: (
                    <AllProvidersWrapper>
                        <ReturnOrderDialog
                            order={mockOrder}
                            returnReasonCodes={returnReasonCodes}
                            open={true}
                            onOpenChange={onOpenChange}
                            {...props}
                        />
                    </AllProvidersWrapper>
                ),
            },
        ],
        { initialEntries: ['/'] }
    );
    const result = render(<RouterProvider router={router} />);
    return { ...result, onOpenChange };
}

/**
 * Force the desktop shell (centered `Dialog`) for the behavior suite. The component swaps to a
 * bottom-sheet `Drawer` below the `md` breakpoint via `matchMedia`, but vaul's pointer handling is
 * unreliable under jsdom; the select/review/focus/error behavior asserted here is shell-agnostic, so
 * we pin the stable Dialog path. The Drawer↔Dialog swap itself is covered by its own test below.
 */
function mockViewport(isDesktop: boolean) {
    window.matchMedia = ((query: string) => ({
        matches: isDesktop,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
    })) as unknown as typeof window.matchMedia;
}

describe('ReturnOrderDialog', () => {
    beforeEach(() => {
        mockSubmit.mockClear();
        mockRevalidate.mockClear();
        mockAddToast.mockClear();
        mockUseFetcher();
        mockViewport(true);
        vi.spyOn(ReactRouter, 'useRevalidator').mockReturnValue({
            revalidate: mockRevalidate,
            state: 'idle',
        } as unknown as ReturnType<typeof ReactRouter.useRevalidator>);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('renders only returnable items (item-2 has 0 available to return)', () => {
        renderDialog();
        expect(screen.getByText('First Product')).toBeInTheDocument();
        expect(screen.queryByText('Second Product')).not.toBeInTheDocument();
    });

    test('checking a row reveals the quantity stepper and reason select, with the default reason pre-selected', async () => {
        const user = userEvent.setup();
        renderDialog();
        const checkbox = screen.getByRole('checkbox');
        await user.click(checkbox);

        const quantityInput = screen.getByLabelText(t('account:orders.returnQuantityLabel'));
        expect(quantityInput).toHaveValue(1);

        const reasonSelect = screen.getByRole('combobox');
        expect(reasonSelect).toHaveValue('Does not fit');
    });

    test('quantity input clamps to the item max', async () => {
        const user = userEvent.setup();
        renderDialog();
        await user.click(screen.getByRole('checkbox'));

        const quantityInput = screen.getByLabelText(t('account:orders.returnQuantityLabel'));
        await user.clear(quantityInput);
        await user.type(quantityInput, '99');

        expect(quantityInput).toHaveValue(2);
    });

    test('"Review return" is disabled until a row is checked, then enabled', async () => {
        const user = userEvent.setup();
        renderDialog();
        const reviewButton = screen.getByRole('button', { name: t('account:orders.returnReviewButton') });
        expect(reviewButton).toBeDisabled();

        await user.click(screen.getByRole('checkbox'));
        expect(reviewButton).not.toBeDisabled();
    });

    test('view swap to review preserves the selected quantity and reason, and Back returns to selection', async () => {
        const user = userEvent.setup();
        renderDialog();
        await user.click(screen.getByRole('checkbox'));

        const quantityInput = screen.getByLabelText(t('account:orders.returnQuantityLabel'));
        await user.clear(quantityInput);
        await user.type(quantityInput, '2');

        const reasonSelect = screen.getByRole('combobox');
        await user.selectOptions(reasonSelect, 'Changed my mind');

        await user.click(screen.getByRole('button', { name: t('account:orders.returnReviewButton') }));

        expect(screen.getByText(t('account:orders.returnReviewQuantity', { count: 2 }))).toBeInTheDocument();
        expect(
            screen.getByText(t('account:orders.returnReviewReason', { reason: 'Changed my mind' }))
        ).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: t('account:orders.returnBackButton') }));

        expect(screen.getByLabelText(t('account:orders.returnQuantityLabel'))).toHaveValue(2);
        expect(screen.getByRole('combobox')).toHaveValue('Changed my mind');
    });

    test('renders the bottom-sheet drawer below the md breakpoint and the centered dialog at/above it', () => {
        // Below md: the Drawer shell (vaul) is used — its content carries data-vaul-drawer-direction.
        mockViewport(false);
        const { unmount } = renderDialog();
        expect(document.querySelector('[data-slot="drawer-content"]')).toBeInTheDocument();
        expect(document.querySelector('[data-slot="dialog-content"]')).not.toBeInTheDocument();
        unmount();

        // At/above md: the centered Dialog shell is used instead.
        mockViewport(true);
        renderDialog();
        expect(document.querySelector('[data-slot="dialog-content"]')).toBeInTheDocument();
        expect(document.querySelector('[data-slot="drawer-content"]')).not.toBeInTheDocument();
    });

    test('swapping to the review view moves focus to the review title (a11y)', async () => {
        const user = userEvent.setup();
        renderDialog();
        await user.click(screen.getByRole('checkbox'));
        await user.click(screen.getByRole('button', { name: t('account:orders.returnReviewButton') }));

        const reviewTitle = screen.getByText(t('account:orders.returnReviewTitle'));
        expect(reviewTitle).toHaveFocus();
    });

    test('"Submit return" posts the return payload to the return-order action exactly once', async () => {
        const user = userEvent.setup();
        renderDialog();
        await user.click(screen.getByRole('checkbox'));
        await user.click(screen.getByRole('button', { name: t('account:orders.returnReviewButton') }));

        const submitButton = screen.getByRole('button', { name: t('account:orders.returnSubmitButton') });
        await user.click(submitButton);

        expect(mockSubmit).toHaveBeenCalledTimes(1);
        expect(mockSubmit).toHaveBeenCalledWith(expect.any(FormData), {
            method: 'post',
            action: '/action/return-order',
        });
    });

    test('while a submit is in flight, "Submit return" is natively disabled so a second click cannot fire another submit', async () => {
        mockUseFetcher(null, 'submitting');
        const user = userEvent.setup();
        renderDialog();
        await user.click(screen.getByRole('checkbox'));
        await user.click(screen.getByRole('button', { name: t('account:orders.returnReviewButton') }));

        const submitButton = screen.getByRole('button', { name: t('account:orders.returnSubmitButton') });
        expect(submitButton).toBeDisabled();

        await user.click(submitButton);
        expect(mockSubmit).not.toHaveBeenCalled();
    });

    test('closes the dialog and toasts a success confirmation on a successful submit (no extra revalidate call)', () => {
        mockUseFetcher({ success: true });
        const { onOpenChange } = renderDialog();

        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(mockRevalidate).not.toHaveBeenCalled();
        expect(mockAddToast).toHaveBeenCalledWith(t('account:orders.returnSuccessTitle'), 'success', {
            description: t('account:orders.returnSuccessMessage'),
        });
    });

    test('a recoverable-400 failure (quantity_exceeded) returns to the selection view and shows the banner there', () => {
        // A settled recoverable-400 sends the shopper back to selection to fix the row; the failed
        // fetcher submission auto-revalidates the loaders, so we do NOT call revalidate() ourselves.
        mockUseFetcher({ success: false, error: { kind: 'quantity_exceeded', status: 400 } });
        const { onOpenChange } = renderDialog();

        const banner = screen.getByTestId('return-recoverable-error');
        expect(banner).toHaveTextContent(t('account:orders.returnError400QuantityMessage'));
        // The selection-view title is present (we were forced back to select), not the review title.
        expect(screen.getByText(t('account:orders.returnDialogTitle', { orderNo: 'INO001' }))).toBeInTheDocument();
        expect(onOpenChange).not.toHaveBeenCalledWith(false);
        expect(mockRevalidate).not.toHaveBeenCalled();
    });

    test('editing a row after a recoverable-400 dismisses the stale error banner', async () => {
        // The banner derives from `fetcher.data`, which persists until the next submit. Once the
        // shopper fixes the offending input, the "quantity exceeds available" message is stale — so
        // any row edit must clear it (they'll get a fresh banner only if the next submit also fails).
        mockUseFetcher({ success: false, error: { kind: 'quantity_exceeded', status: 400 } });
        const user = userEvent.setup();
        renderDialog();

        expect(screen.getByTestId('return-recoverable-error')).toBeInTheDocument();

        // Check the row to reveal the quantity input, then edit it — this acknowledges the error.
        await user.click(screen.getByRole('checkbox'));
        const quantityInput = screen.getByLabelText(t('account:orders.returnQuantityLabel'));
        await user.clear(quantityInput);
        await user.type(quantityInput, '1');

        expect(screen.queryByTestId('return-recoverable-error')).not.toBeInTheDocument();
    });

    test.each([
        ['not_found', 404],
        ['not_returnable', 409],
    ] as const)('a terminal failure (%s) keeps the review banner and disables Submit', async (kind, status) => {
        mockUseFetcher({ success: false, error: { kind, status } });
        const user = userEvent.setup();
        renderDialog();

        await user.click(screen.getByRole('checkbox'));
        await user.click(screen.getByRole('button', { name: t('account:orders.returnReviewButton') }));

        expect(screen.getByTestId('return-submit-error')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: t('account:orders.returnSubmitButton') })).toBeDisabled();
    });

    test('a transient failure keeps the review banner and leaves Submit enabled for inline retry', async () => {
        mockUseFetcher({ success: false, error: { kind: 'transient', status: 500 } });
        const user = userEvent.setup();
        renderDialog();

        await user.click(screen.getByRole('checkbox'));
        await user.click(screen.getByRole('button', { name: t('account:orders.returnReviewButton') }));

        expect(screen.getByTestId('return-submit-error')).toHaveTextContent(
            t('account:orders.returnErrorGenericMessage')
        );
        expect(screen.getByRole('button', { name: t('account:orders.returnSubmitButton') })).toBeEnabled();
    });

    test('reconciles the stepper max when a revalidated order decrements quantityAvailableToReturn', async () => {
        const user = userEvent.setup();
        // A revalidated order drops item-1's available quantity from 2 to 1.
        const decrementedOrder: OrderLike = {
            orderNo: 'INO001',
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'prod-1',
                    productName: 'First Product',
                    quantity: 2,
                    omsData: { quantityAvailableToReturn: 1 },
                },
            ] as unknown as ShopperOrders.schemas['Order']['productItems'],
        };
        const { revalidate } = renderReconcilingDialog(decrementedOrder);

        // Check the row and set the quantity to the current max (2).
        await user.click(screen.getByRole('checkbox'));
        const quantityInput = screen.getByLabelText(t('account:orders.returnQuantityLabel'));
        await user.clear(quantityInput);
        await user.type(quantityInput, '2');
        expect(quantityInput).toHaveValue(2);

        // Swap in the decremented order without remounting the dialog — the reconciliation
        // effect clamps the checked quantity down to the new max (1) and preserves the row.
        revalidate();

        expect(screen.getByLabelText(t('account:orders.returnQuantityLabel'))).toHaveValue(1);
    });

    test('drops a selection row when the revalidated order no longer lists the item as returnable', () => {
        // item-1 is now fully returned (quantityAvailableToReturn: 0) → leaves the returnable list.
        const returnedOrder: OrderLike = {
            orderNo: 'INO001',
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'prod-1',
                    productName: 'First Product',
                    quantity: 2,
                    omsData: { quantityAvailableToReturn: 0 },
                },
            ] as unknown as ShopperOrders.schemas['Order']['productItems'],
        };
        const { revalidate } = renderReconcilingDialog(returnedOrder);
        expect(screen.getByText('First Product')).toBeInTheDocument();

        revalidate();

        expect(screen.queryByText('First Product')).not.toBeInTheDocument();
    });

    test('when no reason code is flagged default, the first code seeds the selection so Review return is enabled', async () => {
        const user = userEvent.setup();
        renderDialog({
            returnReasonCodes: [
                { reason: 'Changed my mind', default: false },
                { reason: 'Does not fit', default: false },
            ],
        });

        await user.click(screen.getByRole('checkbox'));
        // The controlled select falls back to the first code, not an empty value...
        expect(screen.getByRole('combobox')).toHaveValue('Changed my mind');
        // ...so canReview's reason guard is satisfied and Review return is enabled.
        expect(screen.getByRole('button', { name: t('account:orders.returnReviewButton') })).not.toBeDisabled();
    });

    test('empty returnReasonCodes hides the reason select, keeps Review return enabled, and advances to review', async () => {
        // SCAPI's `OmsReturnProductItem.reason` is optional — the server applies its default when
        // absent. When the OMS metadata fetch degraded, we hide the reason select and let the
        // shopper submit; the destructive banner from the previous UX is no longer rendered.
        const user = userEvent.setup();
        renderDialog({ returnReasonCodes: [] });

        // Review return is enabled with no rows checked? No — the checked-count guard still applies.
        expect(screen.getByRole('button', { name: t('account:orders.returnReviewButton') })).toBeDisabled();

        await user.click(screen.getByRole('checkbox'));

        // No destructive alert, and no combobox rendered.
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

        // Review return is enabled and clicking it advances to the review view.
        const reviewButton = screen.getByRole('button', { name: t('account:orders.returnReviewButton') });
        expect(reviewButton).not.toBeDisabled();
        await user.click(reviewButton);
        expect(screen.getByText(t('account:orders.returnReviewTitle'))).toBeInTheDocument();
    });

    test('reasons-unavailable review view swaps the subtitle and drops the per-row `Reason:` line', async () => {
        // The review view previously rendered `Reason: ` with an empty value when reason codes
        // failed to load. Mirror the cancel dialog's pattern: swap the header subtitle to the
        // "no reasons" variant and omit the per-item reason line entirely.
        const user = userEvent.setup();
        renderDialog({ returnReasonCodes: [] });

        await user.click(screen.getByRole('checkbox'));
        await user.click(screen.getByRole('button', { name: t('account:orders.returnReviewButton') }));

        expect(screen.getByText(t('account:orders.returnReviewTitle'))).toBeInTheDocument();
        expect(screen.getByText(t('account:orders.returnReviewSubtitleNoReasons'))).toBeInTheDocument();
        expect(screen.queryByText(t('account:orders.returnReviewSubtitle'))).not.toBeInTheDocument();
        expect(
            screen.queryByText(
                (_, node) => node?.textContent?.trim() === t('account:orders.returnReviewReason', { reason: '' }).trim()
            )
        ).not.toBeInTheDocument();
    });

    test('reasons-unavailable submit omits `reason` from every payload item so the server applies its default', async () => {
        // Regression guard: without reason codes, the payload must NOT include a `reason` field on
        // any item — the SCAPI server fills in its default when the field is absent.
        const user = userEvent.setup();
        renderDialog({ returnReasonCodes: [] });

        await user.click(screen.getByRole('checkbox'));
        await user.click(screen.getByRole('button', { name: t('account:orders.returnReviewButton') }));
        await user.click(screen.getByRole('button', { name: t('account:orders.returnSubmitButton') }));

        expect(mockSubmit).toHaveBeenCalledTimes(1);
        const [formData] = mockSubmit.mock.calls[0];
        const payload = JSON.parse((formData as FormData).get('productItems') as string) as Array<{
            itemId: string;
            quantity: number;
            reason?: string;
        }>;
        expect(payload).toHaveLength(1);
        expect(payload[0]).toEqual({ itemId: 'item-1', quantity: 1 });
        expect(payload[0]).not.toHaveProperty('reason');
    });

    test('closing the dialog restores focus to the trigger button when triggerRef is provided', async () => {
        // Radix `<Dialog>` only auto-restores focus when it owns the `<DialogTrigger>`. This dialog
        // is controlled without a trigger, so `onCloseAutoFocus` must explicitly send focus back to
        // the "Return Items" button ref forwarded by the caller.
        const user = userEvent.setup();
        function Harness() {
            const [open, setOpen] = useState(true);
            const triggerRef = { current: null } as { current: HTMLButtonElement | null };
            return (
                <AllProvidersWrapper>
                    <button
                        type="button"
                        ref={(el) => {
                            triggerRef.current = el;
                        }}
                        data-testid="external-trigger">
                        Return Items
                    </button>
                    <ReturnOrderDialog
                        order={mockOrder}
                        returnReasonCodes={returnReasonCodes}
                        open={open}
                        onOpenChange={setOpen}
                        triggerRef={triggerRef}
                    />
                </AllProvidersWrapper>
            );
        }
        const router = createMemoryRouter([{ path: '/', element: <Harness /> }], { initialEntries: ['/'] });
        render(<RouterProvider router={router} />);

        expect(screen.getByText(t('account:orders.returnDialogTitle', { orderNo: 'INO001' }))).toBeInTheDocument();

        await user.keyboard('{Escape}');

        expect(screen.getByTestId('external-trigger')).toHaveFocus();
    });

    test('closing the dialog falls back to fallbackFocusRef when the trigger has unmounted', async () => {
        // Revalidation-driven unmount: the "Return Items" button lives inside a Suspense boundary
        // that can re-suspend while the dialog is still open, leaving `triggerRef.current` null. In
        // that case focus must land on the stable fallback landmark, not on `document.body`.
        const user = userEvent.setup();
        // Captured setter so the test can unmount the trigger from outside — the dialog is modal,
        // so any in-DOM control is aria-hidden and its pointer events are blocked.
        let unmountTrigger: () => void = () => {};
        function Harness() {
            const [open, setOpen] = useState(true);
            const [triggerMounted, setTriggerMounted] = useState(true);
            unmountTrigger = () => setTriggerMounted(false);
            const triggerRef = { current: null } as { current: HTMLButtonElement | null };
            const fallbackRef = { current: null } as { current: HTMLHeadingElement | null };
            return (
                <AllProvidersWrapper>
                    <h1
                        ref={(el) => {
                            fallbackRef.current = el;
                        }}
                        tabIndex={-1}
                        data-testid="fallback-landmark">
                        Order Details
                    </h1>
                    {triggerMounted && (
                        <button
                            type="button"
                            ref={(el) => {
                                triggerRef.current = el;
                            }}
                            data-testid="external-trigger">
                            Return Items
                        </button>
                    )}
                    <ReturnOrderDialog
                        order={mockOrder}
                        returnReasonCodes={returnReasonCodes}
                        open={open}
                        onOpenChange={setOpen}
                        triggerRef={triggerRef}
                        fallbackFocusRef={fallbackRef}
                    />
                </AllProvidersWrapper>
            );
        }
        const router = createMemoryRouter([{ path: '/', element: <Harness /> }], { initialEntries: ['/'] });
        render(<RouterProvider router={router} />);

        // Simulate revalidation-driven unmount of the trigger while the dialog stays open.
        act(() => unmountTrigger());
        expect(screen.queryByTestId('external-trigger')).not.toBeInTheDocument();

        await user.keyboard('{Escape}');

        expect(screen.getByTestId('fallback-landmark')).toHaveFocus();
    });
});
