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
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
// eslint-disable-next-line import/no-namespace -- vi.spyOn requires namespace import
import * as ReactRouter from 'react-router';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { GuestOrderActions } from './guest-order-actions';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import type { OrderLike } from '@/lib/order-management/types';
import type { OmsMetaDataResult } from '@/lib/api/order.server';
import type { ShopperOrders } from '@/scapi';

const { t } = getTranslation();

const mockOrder: Partial<OrderLike> = {
    orderNo: 'ORDER-001',
    omsData: {},
    productItems: [
        {
            itemId: 'item-1',
            productId: 'prod-1',
            productName: 'First Product',
            quantity: 2,
            omsData: {
                status: 'ordered',
                quantityAvailableToReturn: 2,
                quantityAvailableToCancel: 2,
                quantityOrdered: 2,
            },
        },
    ] as unknown as ShopperOrders.schemas['Order']['productItems'],
};

const mockOmsMetaData: OmsMetaDataResult = {
    omsActive: true,
    cancelReasonCodes: [{ reason: 'Changed my mind', default: true }],
    returnReasonCodes: [{ reason: 'Does not fit', default: true }],
};

const mockSubmit = vi.fn();

function mockUseFetcher(data: unknown = null, state: 'idle' | 'submitting' | 'loading' = 'idle') {
    vi.spyOn(ReactRouter, 'useFetcher').mockReturnValue({
        submit: mockSubmit,
        data,
        state,
    } as unknown as ReturnType<typeof ReactRouter.useFetcher>);
}

function renderGuestOrderActions(props: Partial<React.ComponentProps<typeof GuestOrderActions>> = {}) {
    const onOrderUpdated = vi.fn();
    const router = createMemoryRouter(
        [
            {
                path: '/',
                element: (
                    <AllProvidersWrapper>
                        <GuestOrderActions
                            order={mockOrder}
                            omsMetaData={mockOmsMetaData}
                            orderNumber="ORDER-001"
                            email="guest@example.com"
                            onOrderUpdated={onOrderUpdated}
                            {...props}
                        />
                    </AllProvidersWrapper>
                ),
            },
        ],
        { initialEntries: ['/'] }
    );
    const result = render(<RouterProvider router={router} />);
    return { ...result, onOrderUpdated };
}

describe('GuestOrderActions', () => {
    beforeEach(() => {
        mockSubmit.mockClear();
        mockUseFetcher();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('renders nothing when OMS is not active', () => {
        const { container } = renderGuestOrderActions({ omsMetaData: { ...mockOmsMetaData, omsActive: false } });
        expect(container).toBeEmptyDOMElement();
    });

    test('renders enabled Return Items and Cancel order buttons when order is eligible', () => {
        renderGuestOrderActions();
        const returnButton = screen.getByRole('button', { name: t('account:orders.returnItems') });
        const cancelButton = screen.getByRole('button', { name: t('account:orders.cancelOrder') });
        expect(returnButton).not.toHaveAttribute('aria-disabled');
        expect(cancelButton).not.toHaveAttribute('aria-disabled');
    });

    test('disables Return Items when there is nothing left to return', () => {
        const ineligibleOrder: Partial<OrderLike> = {
            ...mockOrder,
            productItems: [
                {
                    ...(mockOrder.productItems as Array<Record<string, unknown>>)[0],
                    omsData: { status: 'ordered', quantityAvailableToReturn: 0 },
                },
            ] as unknown as ShopperOrders.schemas['Order']['productItems'],
        };
        renderGuestOrderActions({ order: ineligibleOrder });
        const returnButton = screen.getByRole('button', { name: t('account:orders.returnItems') });
        expect(returnButton).toHaveAttribute('aria-disabled', 'true');
        expect(screen.getByText(t('account:orders.returnUnavailable'))).toBeInTheDocument();
    });

    test('disables Cancel order when the order is not cancellable', () => {
        const ineligibleOrder: Partial<OrderLike> = {
            ...mockOrder,
            productItems: [
                {
                    ...(mockOrder.productItems as Array<Record<string, unknown>>)[0],
                    omsData: { status: 'ordered', quantityAvailableToCancel: 0, quantityOrdered: 2 },
                },
            ] as unknown as ShopperOrders.schemas['Order']['productItems'],
        };
        renderGuestOrderActions({ order: ineligibleOrder });
        const cancelButton = screen.getByRole('button', { name: t('account:orders.cancelOrder') });
        expect(cancelButton).toHaveAttribute('aria-disabled', 'true');
        expect(screen.getByText(t('account:orders.cancelUnavailable'))).toBeInTheDocument();
    });

    test('opens the cancel dialog on click, submitting to the guest action with orderNumber/email fields', async () => {
        renderGuestOrderActions();
        fireEvent.click(screen.getByRole('button', { name: t('account:orders.cancelOrder') }));

        const dialogTitle = await screen.findByText(t('account:orders.cancelDialogTitle', { orderNo: 'ORDER-001' }));
        expect(dialogTitle).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: t('account:orders.cancelConfirm') }));

        expect(mockSubmit).toHaveBeenCalledWith(
            expect.any(FormData),
            expect.objectContaining({ method: 'post', action: '/action/order-lookup-cancel' })
        );
        const formData = mockSubmit.mock.calls[0][0] as FormData;
        expect(formData.get('orderNumber')).toBe('ORDER-001');
        expect(formData.get('email')).toBe('guest@example.com');
    });

    test('opens the return dialog on click, rendering the item selection view', async () => {
        renderGuestOrderActions();
        fireEvent.click(screen.getByRole('button', { name: t('account:orders.returnItems') }));

        const reviewButton = await screen.findByRole('button', { name: t('account:orders.returnReviewButton') });
        expect(reviewButton).toBeInTheDocument();
        expect(reviewButton).toBeDisabled();
    });

    test('shows a deferred success alert and calls onOrderUpdated after a successful cancel settles', async () => {
        vi.useFakeTimers();
        const updatedOrder = { ...mockOrder, orderNo: 'ORDER-001' };
        const updatedOmsMetaData: OmsMetaDataResult = { ...mockOmsMetaData, cancelReasonCodes: [] };
        mockUseFetcher({ success: true, order: updatedOrder, omsMetaData: updatedOmsMetaData }, 'idle');

        const { onOrderUpdated } = renderGuestOrderActions();
        fireEvent.click(screen.getByRole('button', { name: t('account:orders.cancelOrder') }));
        await act(async () => {
            await Promise.resolve();
        });

        expect(onOrderUpdated).toHaveBeenCalledWith(updatedOrder, updatedOmsMetaData);
        expect(screen.queryByTestId('guest-order-actions-feedback')).not.toBeInTheDocument();

        act(() => {
            vi.advanceTimersByTime(300);
        });

        expect(screen.getByTestId('guest-order-actions-feedback')).toBeInTheDocument();
        expect(screen.getByText(t('account:orders.cancelSuccessTitle'))).toBeInTheDocument();

        vi.useRealTimers();
    });

    test('shows a deferred error alert for a terminal cancel failure and disables the button', async () => {
        vi.useFakeTimers();
        mockUseFetcher({ success: false, error: { kind: 'not_found', status: 404 } }, 'idle');

        renderGuestOrderActions();
        fireEvent.click(screen.getByRole('button', { name: t('account:orders.cancelOrder') }));
        await act(async () => {
            await Promise.resolve();
        });

        act(() => {
            vi.advanceTimersByTime(300);
        });

        expect(screen.getByTestId('guest-order-actions-feedback')).toBeInTheDocument();
        expect(screen.getByText(t('account:orders.cancelErrorNotFoundTitle'))).toBeInTheDocument();
        expect(screen.getByRole('button', { name: t('account:orders.cancelOrder') })).toHaveAttribute(
            'aria-disabled',
            'true'
        );

        vi.useRealTimers();
    });

    test('shows a deferred success alert after a successful return settles', async () => {
        vi.useFakeTimers();
        const updatedOrder = { ...mockOrder };
        const updatedOmsMetaData: OmsMetaDataResult = { ...mockOmsMetaData };
        mockUseFetcher({ success: true, order: updatedOrder, omsMetaData: updatedOmsMetaData }, 'idle');

        const { onOrderUpdated } = renderGuestOrderActions();
        fireEvent.click(screen.getByRole('button', { name: t('account:orders.returnItems') }));
        await act(async () => {
            await Promise.resolve();
        });

        expect(onOrderUpdated).toHaveBeenCalledWith(updatedOrder, updatedOmsMetaData);

        act(() => {
            vi.advanceTimersByTime(300);
        });

        expect(screen.getByTestId('guest-order-actions-feedback')).toBeInTheDocument();
        expect(screen.getByText(t('account:orders.returnSuccessTitle'))).toBeInTheDocument();

        vi.useRealTimers();
    });
});
