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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { advanceStatus, listReturns, resetReturnStoreForTests } from '@/lib/returns/return-store';
import type { ReturnableLine } from '@/lib/returns/types';
import { ReturnForm } from './return-form';
import { ReturnInProgressBadge } from './return-in-progress-badge';
import { ReturnOrExchangeButton } from './return-or-exchange-button';

const navigate = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/use-navigate', () => ({ useNavigate: () => navigate }));
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return {
        ...actual,
        Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string }) => (
            <a href={to} {...rest}>
                {children}
            </a>
        ),
    };
});

const NOW = '2026-06-30T12:00:00.000Z';
const recent = '2026-06-20T12:00:00.000Z';
const old = '2026-01-01T12:00:00.000Z';

const variants = [
    { sku: 'shirt-m', variationValues: { size: 'M' }, orderable: true },
    { sku: 'shirt-l', variationValues: { size: 'L' }, orderable: true },
];
const attributes = [
    {
        id: 'size',
        name: 'Size',
        values: [
            { value: 'M', name: 'M' },
            { value: 'L', name: 'L' },
        ],
    },
];

const line = (overrides: Partial<ReturnableLine>): ReturnableLine => ({
    lineKey: 'shirt',
    sku: 'shirt-m',
    name: 'Cotton Shirt',
    quantity: 2,
    deliveryId: 'd1',
    deliveredAt: recent,
    variationValues: { size: 'M' },
    variationAttributes: attributes,
    variants,
    ...overrides,
});

const lines: ReturnableLine[] = [
    line({}),
    line({ lineKey: 'swim', sku: 'swim-1', name: 'Swim Trunks', categoryId: 'swimwear', variants: [] }),
    line({ lineKey: 'coat', sku: 'coat-1', name: 'Old Coat', deliveredAt: old, variants: [] }),
    line({ lineKey: 'final', sku: 'DU-879242-M', name: 'Final Sale Hat', deliveryId: 'd2' }),
];

const renderForm = () => render(<ReturnForm orderNo="O1" lines={lines} now={NOW} />, { wrapper: AllProvidersWrapper });

describe('ReturnForm', () => {
    beforeEach(() => {
        window.localStorage.clear();
        resetReturnStoreForTests();
        navigate.mockClear();
    });

    it('shows a status and reason for every item and groups them by delivery', () => {
        renderForm();
        expect(screen.getByTestId('item-status-eligible')).toBeInTheDocument();
        expect(screen.getByTestId('item-status-not-returnable')).toBeInTheDocument();
        expect(screen.getByTestId('item-status-window-closed')).toBeInTheDocument();
        expect(screen.getByTestId('item-status-exchange-only')).toBeInTheDocument();
        expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2);
    });

    it('cannot select items that are not returnable or past the window', () => {
        renderForm();
        expect(screen.getByRole('checkbox', { name: /Swim Trunks/ })).toBeDisabled();
        expect(screen.getByRole('checkbox', { name: /Old Coat/ })).toBeDisabled();
        expect(screen.getByRole('checkbox', { name: /Cotton Shirt/ })).toBeEnabled();
    });

    it('offers only Exchange for an exchange-only item', async () => {
        const user = userEvent.setup();
        renderForm();
        await user.click(screen.getByRole('checkbox', { name: /Final Sale Hat/ }));
        expect(screen.getByRole('radio', { name: 'Exchange' })).toBeChecked();
        expect(screen.queryByRole('radio', { name: 'Return' })).not.toBeInTheDocument();
    });

    it('keeps Submit disabled until the selection is complete', async () => {
        const user = userEvent.setup();
        renderForm();
        const submit = screen.getByTestId('return-submit');
        await waitFor(() => expect(submit).toBeDisabled());
        await user.click(screen.getByRole('checkbox', { name: /Cotton Shirt/ }));
        expect(submit).toBeDisabled();
        await user.selectOptions(screen.getByLabelText('Reason'), 'too-small');
        expect(submit).toBeEnabled();
    });

    it('blocks an exchange to the same variant and allows a different one', async () => {
        const user = userEvent.setup();
        renderForm();
        await user.click(screen.getByRole('checkbox', { name: /Cotton Shirt/ }));
        await user.selectOptions(screen.getByLabelText('Reason'), 'too-small');
        await user.click(screen.getByRole('radio', { name: 'Exchange' }));
        expect(screen.getByTestId('return-submit')).toBeDisabled();
        await user.selectOptions(screen.getByLabelText('Size'), 'L');
        expect(screen.getByTestId('return-submit')).toBeEnabled();
    });

    it('saves the return once and opens its tracking page, even on a double click', async () => {
        const user = userEvent.setup();
        renderForm();
        await user.click(screen.getByRole('checkbox', { name: /Cotton Shirt/ }));
        await user.selectOptions(screen.getByLabelText('Reason'), 'defective');
        const submit = screen.getByTestId('return-submit');
        await user.dblClick(submit);

        await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
        const saved = await listReturns();
        expect(saved).toHaveLength(1);
        expect(saved[0]).toMatchObject({
            orderNo: 'O1',
            items: [{ lineKey: 'shirt', action: 'return', reason: 'defective', quantity: 2 }],
        });
        expect(navigate.mock.calls[0][0]).toContain(saved[0].rmaNo);
    });

    it('does not let already-requested units be requested again', async () => {
        const user = userEvent.setup();
        const { unmount } = renderForm();
        await user.click(screen.getByRole('checkbox', { name: /Cotton Shirt/ }));
        await user.selectOptions(screen.getByLabelText('Reason'), 'defective');
        await user.click(screen.getByTestId('return-submit'));
        await waitFor(() => expect(navigate).toHaveBeenCalled());
        unmount();

        renderForm();
        expect(screen.getByRole('checkbox', { name: /Cotton Shirt/ })).toBeDisabled();
    });
});

describe('ReturnInProgressBadge', () => {
    beforeEach(() => {
        window.localStorage.clear();
        resetReturnStoreForTests();
    });

    it('renders nothing when the order has no return', () => {
        render(<ReturnInProgressBadge orderNo="O1" />, { wrapper: AllProvidersWrapper });
        expect(screen.queryByTestId('return-in-progress-badge')).not.toBeInTheDocument();
    });

    it('links to the return once one exists', async () => {
        const user = userEvent.setup();
        const { unmount } = renderForm();
        await user.click(screen.getByRole('checkbox', { name: /Cotton Shirt/ }));
        await user.selectOptions(screen.getByLabelText('Reason'), 'defective');
        await user.click(screen.getByTestId('return-submit'));
        await waitFor(() => expect(navigate).toHaveBeenCalled());
        unmount();

        render(<ReturnInProgressBadge orderNo="O1" />, { wrapper: AllProvidersWrapper });
        const badge = await screen.findByTestId('return-in-progress-badge');
        expect(within(badge).getByText('Return in progress').closest('a')).toHaveAttribute(
            'href',
            expect.stringContaining('/account/returns/RMA-')
        );
    });
});

describe('ReturnInProgressBadge states', () => {
    beforeEach(() => {
        window.localStorage.clear();
        resetReturnStoreForTests();
        navigate.mockClear();
    });

    it('says Return in progress while open and the final status once finished', async () => {
        const user = userEvent.setup();
        const { unmount } = renderForm();
        await user.click(screen.getByRole('checkbox', { name: /Cotton Shirt/ }));
        await user.selectOptions(screen.getByLabelText('Reason'), 'defective');
        await user.click(screen.getByTestId('return-submit'));
        await waitFor(() => expect(navigate).toHaveBeenCalled());
        unmount();

        render(<ReturnInProgressBadge orderNo="O1" />, { wrapper: AllProvidersWrapper });
        expect(await screen.findByText('Return in progress')).toBeInTheDocument();

        const [saved] = await listReturns();
        await act(async () => {
            for (let i = 0; i < 3; i += 1) await advanceStatus(saved.rmaNo);
        });
        expect(await screen.findByText('Refunded')).toBeInTheDocument();
        expect(screen.queryByText('Return in progress')).not.toBeInTheDocument();
    });
});

describe('ReturnOrExchangeButton', () => {
    beforeEach(() => {
        window.localStorage.clear();
        resetReturnStoreForTests();
        navigate.mockClear();
    });

    it('shows when the order has no return', async () => {
        render(<ReturnOrExchangeButton orderNo="O1" />, { wrapper: AllProvidersWrapper });
        expect(await screen.findByTestId('return-or-exchange-button')).toBeInTheDocument();
    });

    it('is hidden while a return is in progress and comes back once it is finished', async () => {
        const user = userEvent.setup();
        const { unmount } = renderForm();
        await user.click(screen.getByRole('checkbox', { name: /Cotton Shirt/ }));
        await user.selectOptions(screen.getByLabelText('Reason'), 'defective');
        await user.click(screen.getByTestId('return-submit'));
        await waitFor(() => expect(navigate).toHaveBeenCalled());
        unmount();

        render(<ReturnOrExchangeButton orderNo="O1" />, { wrapper: AllProvidersWrapper });
        await waitFor(() => expect(screen.queryByTestId('return-or-exchange-button')).not.toBeInTheDocument());

        const [saved] = await listReturns();
        await act(async () => {
            for (let i = 0; i < 3; i += 1) await advanceStatus(saved.rmaNo);
        });
        expect(await screen.findByTestId('return-or-exchange-button')).toBeInTheDocument();
    });
});
