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
import CancelOrderDialog from './cancel-order-dialog';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import type { ShopperOrders } from '@/scapi';

const { t } = getTranslation();

const cancelReasonCodes: ShopperOrders.schemas['OmsReasonCode'][] = [
    { reason: 'Item price too high', default: false },
    { reason: 'Changed my mind', default: true },
    { reason: 'No longer needed', default: false },
];

const mockSubmit = vi.fn();

function mockUseFetcher(data: unknown = null, state: 'idle' | 'submitting' | 'loading' = 'idle') {
    vi.spyOn(ReactRouter, 'useFetcher').mockReturnValue({
        submit: mockSubmit,
        data,
        state,
    } as unknown as ReturnType<typeof ReactRouter.useFetcher>);
}

function renderDialog(props: Partial<React.ComponentProps<typeof CancelOrderDialog>> = {}) {
    const onOpenChange = vi.fn();
    const router = createMemoryRouter(
        [
            {
                path: '/',
                element: (
                    <AllProvidersWrapper>
                        <CancelOrderDialog
                            orderNo="00166274"
                            cancelReasonCodes={cancelReasonCodes}
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

describe('CancelOrderDialog', () => {
    beforeEach(() => {
        mockSubmit.mockClear();
        mockUseFetcher();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('renders the dialog title with order number', () => {
        renderDialog();
        expect(screen.getByText(t('account:orders.cancelDialogTitle', { orderNo: '00166274' }))).toBeInTheDocument();
    });

    test('renders reason dropdown pre-selecting the default reason', () => {
        renderDialog();
        const select = screen.getByRole('combobox');
        expect(select).toBeInTheDocument();
        expect(select).toHaveValue('Changed my mind');
        expect(screen.getByText(t('account:orders.cancelReasonPlaceholder'))).toBeInTheDocument();
        expect(screen.getByText('Item price too high')).toBeInTheDocument();
        expect(screen.getByText('Changed my mind')).toBeInTheDocument();
        expect(screen.getByText('No longer needed')).toBeInTheDocument();
    });

    test('renders reason dropdown with empty value when no default reason exists', () => {
        const noDefaultCodes: ShopperOrders.schemas['OmsReasonCode'][] = [
            { reason: 'Item price too high', default: false },
            { reason: 'No longer needed', default: false },
        ];
        renderDialog({ cancelReasonCodes: noDefaultCodes });
        const select = screen.getByRole('combobox');
        expect(select).toHaveValue('');
    });

    test('hides reason dropdown when cancelReasonCodes is empty', () => {
        renderDialog({ cancelReasonCodes: [] });
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
        expect(screen.getByText(t('account:orders.cancelDialogSubtitleNoReasons'))).toBeInTheDocument();
    });

    test('renders subtitle for reason selection when reasons are available', () => {
        renderDialog();
        expect(screen.getByText(t('account:orders.cancelDialogSubtitle'))).toBeInTheDocument();
    });

    test('renders impact text', () => {
        renderDialog();
        expect(screen.getByText(t('account:orders.cancelDialogImpact'))).toBeInTheDocument();
    });

    test('"Keep order" button calls onOpenChange(false)', async () => {
        const user = userEvent.setup();
        const { onOpenChange } = renderDialog();
        await user.click(screen.getByRole('button', { name: t('account:orders.cancelKeepOrder') }));
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    test('"Confirm cancellation" submits with orderNo and selected reason', async () => {
        const user = userEvent.setup();
        renderDialog();

        const select = screen.getByRole('combobox');
        await user.selectOptions(select, 'Changed my mind');

        await user.click(screen.getByRole('button', { name: t('account:orders.cancelConfirm') }));

        expect(mockSubmit).toHaveBeenCalledTimes(1);
        expect(mockSubmit).toHaveBeenCalledWith(expect.any(FormData), {
            method: 'post',
            action: '/action/cancel-order',
        });

        const formData = mockSubmit.mock.calls[0][0] as FormData;
        expect(formData.get('orderNo')).toBe('00166274');
        expect(formData.get('reason')).toBe('Changed my mind');
    });

    test('"Confirm cancellation" submits with default reason when user does not change selection', async () => {
        const user = userEvent.setup();
        renderDialog();

        await user.click(screen.getByRole('button', { name: t('account:orders.cancelConfirm') }));

        const formData = mockSubmit.mock.calls[0][0] as FormData;
        expect(formData.get('orderNo')).toBe('00166274');
        expect(formData.get('reason')).toBe('Changed my mind');
    });

    test('"Confirm cancellation" submits without reason when placeholder is explicitly selected', async () => {
        const user = userEvent.setup();
        renderDialog();

        const select = screen.getByRole('combobox');
        await user.selectOptions(select, '');

        await user.click(screen.getByRole('button', { name: t('account:orders.cancelConfirm') }));

        const formData = mockSubmit.mock.calls[0][0] as FormData;
        expect(formData.get('orderNo')).toBe('00166274');
        expect(formData.get('reason')).toBeNull();
    });

    test('"Confirm cancellation" submits without reason when no reason codes available', async () => {
        const user = userEvent.setup();
        renderDialog({ cancelReasonCodes: [] });

        await user.click(screen.getByRole('button', { name: t('account:orders.cancelConfirm') }));

        const formData = mockSubmit.mock.calls[0][0] as FormData;
        expect(formData.get('orderNo')).toBe('00166274');
        expect(formData.get('reason')).toBeNull();
    });

    test('buttons are disabled while submitting', () => {
        mockUseFetcher(null, 'submitting');
        renderDialog();

        expect(screen.getByRole('button', { name: t('account:orders.cancelConfirmSubmitting') })).toBeDisabled();
        expect(screen.getByRole('button', { name: t('account:orders.cancelKeepOrder') })).toBeDisabled();
    });

    test('closes dialog on successful response', () => {
        mockUseFetcher({ success: true });
        const { onOpenChange } = renderDialog();
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    test('closes dialog on error response (matches PWA Kit pattern)', () => {
        mockUseFetcher({ success: false, error: { kind: 'not_found', status: 404 } });
        const { onOpenChange } = renderDialog();
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    test('closing the dialog restores focus to the trigger button when triggerRef is provided', async () => {
        // Radix `<Dialog>` only auto-restores focus when it owns the `<DialogTrigger>`. This dialog
        // is controlled without a trigger, so `onCloseAutoFocus` must explicitly send focus back to
        // the "Cancel Order" button ref forwarded by the caller.
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
                        Cancel Order
                    </button>
                    <CancelOrderDialog
                        orderNo="00166274"
                        cancelReasonCodes={cancelReasonCodes}
                        open={open}
                        onOpenChange={setOpen}
                        triggerRef={triggerRef}
                    />
                </AllProvidersWrapper>
            );
        }
        const router = createMemoryRouter([{ path: '/', element: <Harness /> }], { initialEntries: ['/'] });
        render(<RouterProvider router={router} />);

        expect(screen.getByText(t('account:orders.cancelDialogTitle', { orderNo: '00166274' }))).toBeInTheDocument();

        await user.keyboard('{Escape}');

        expect(screen.getByTestId('external-trigger')).toHaveFocus();
    });

    test('closing the dialog falls back to fallbackFocusRef when the trigger has unmounted', async () => {
        // After a successful cancel the "Cancel Order" button returns null, so `triggerRef.current`
        // is left null while the dialog closes. Focus must land on the stable fallback landmark
        // (the Order Details heading), not drop to `document.body`.
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
                            Cancel Order
                        </button>
                    )}
                    <CancelOrderDialog
                        orderNo="00166274"
                        cancelReasonCodes={cancelReasonCodes}
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

        // Simulate the successful-cancel unmount of the trigger while the dialog stays open.
        act(() => unmountTrigger());
        expect(screen.queryByTestId('external-trigger')).not.toBeInTheDocument();

        await user.keyboard('{Escape}');

        expect(screen.getByTestId('fallback-landmark')).toHaveFocus();
    });
});
