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
import { useSyncExternalStore } from 'react';
import { describe, test, expect, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, type ActionFunctionArgs, type RouteObject } from 'react-router';
import PromoCodeForm from './index';
import { Toaster } from '@/components/toast';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockLocale, mockSiteObject } from '@/test-utils/config';
import { resourceRoutes } from '@/route-paths';

// Mock only useBasketUpdater so the publish-back can be asserted; the rest of the provider is unused by this subtree.
const mockUpdateBasket = vi.fn();
vi.mock('@/providers/basket', () => ({
    useBasketUpdater: () => mockUpdateBasket,
}));

const { t } = getTranslation();

type CouponItemFixture = {
    couponItemId?: string;
    code: string;
    statusCode?: 'applied' | 'adhoc' | 'no_applicable_promotion' | 'coupon_code_unknown';
};

/**
 * Render `<PromoCodeForm>` against a real `createMemoryRouter` whose
 * `/action/promo-code-add` and `/action/promo-code-remove` routes are stubbed.
 *
 * The action handlers run inside the actual fetcher round-trip — no mocked
 * fetcher state, no mocked hook. Each test passes the action body it needs to
 * exercise success/error/in-flight behavior end-to-end.
 */
type BasketFixture = { basketId?: string; couponItems?: CouponItemFixture[] };

const renderWithFetcherActions = ({
    basket = { basketId: 'test-basket-id' },
    addAction,
    removeAction,
}: {
    basket?: BasketFixture;
    addAction?: (args: ActionFunctionArgs) => unknown | Promise<unknown>;
    removeAction?: (args: ActionFunctionArgs) => unknown | Promise<unknown>;
} = {}) => {
    // Drive `basket` through an external store so a test can update it on the
    // already-mounted component (via the returned `setBasket`). Recreating the
    // router instead would remount <PromoCodeForm> and drop the inline error a
    // stale-error test needs to assert against. Existing tests ignore `setBasket`.
    let current: BasketFixture = basket;
    const listeners = new Set<() => void>();
    const store = {
        get: () => current,
        subscribe: (cb: () => void) => {
            listeners.add(cb);
            return () => listeners.delete(cb);
        },
        set: (next: BasketFixture) => {
            current = next;
            listeners.forEach((cb) => cb());
        },
    };

    const BasketBoundForm = () => {
        const liveBasket = useSyncExternalStore(store.subscribe, store.get);
        return <PromoCodeForm basket={liveBasket} />;
    };

    const routes: RouteObject[] = [
        {
            path: '/cart',
            element: (
                <SiteProvider
                    site={mockSiteObject}
                    locale={mockLocale}
                    language={mockSiteObject.defaultLocale}
                    currency={mockSiteObject.defaultCurrency}>
                    <BasketBoundForm />
                    <Toaster richColors expand position="top-right" />
                </SiteProvider>
            ),
        },
        {
            path: resourceRoutes.promoCodeAdd,
            action: addAction ?? (() => ({ success: true })),
        },
        {
            path: resourceRoutes.promoCodeRemove,
            action: removeAction ?? (() => ({ success: true })),
        },
    ];

    const router = createMemoryRouter(routes, { initialEntries: ['/cart'] });
    const result = render(<RouterProvider router={router} />);
    // Update the mounted component's basket (wrapped in act so effects flush).
    const setBasket = (next: BasketFixture) => act(() => store.set(next));
    return { ...result, setBasket };
};

/**
 * Find a Sonner toast by its message text, scoped to `[data-sonner-toast]` so
 * the assertion never accidentally matches a copy of the same string elsewhere
 * in the DOM (e.g. inline form errors). Polls until the toast actually mounts.
 */
const findToast = async (text: string) =>
    waitFor(() => {
        const matches = screen.queryAllByText(text);
        const toast = matches.find((el) => el.closest('[data-sonner-toast]'));
        if (!toast) {
            throw new Error(`No toast found with text: ${text}`);
        }
        return toast;
    });

/**
 * Returns a controllable promise so a test can hold an action in `submitting`
 * state, assert intermediate UI, then resolve.
 */
const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

describe('PromoCodeForm', () => {
    beforeEach(() => {
        mockUpdateBasket.mockClear();
    });

    afterEach(() => {
        mockUpdateBasket.mockClear();
    });

    test('renders accordion with promo code title', () => {
        renderWithFetcherActions();

        expect(screen.getByText(t('cart:promoCode.accordionTitle'))).toBeInTheDocument();
    });

    test('accordion is expanded by default', () => {
        renderWithFetcherActions();

        const accordionTrigger = screen.getByRole('button', { name: t('cart:promoCode.accordionTitle') });
        expect(accordionTrigger).toHaveAttribute('aria-expanded', 'true');
    });

    test('form is rendered when accordion is expanded', () => {
        renderWithFetcherActions();

        expect(screen.getByTestId('promo-code-form')).toBeInTheDocument();
        expect(screen.getByPlaceholderText(t('cart:promoCode.placeholder'))).toBeInTheDocument();
        expect(screen.getByRole('button', { name: t('cart:promoCode.apply') })).toBeInTheDocument();
    });

    test('validates minimum length requirement', async () => {
        const user = userEvent.setup();
        const addAction = vi.fn(() => ({ success: true }));
        renderWithFetcherActions({ addAction });

        const input = screen.getByPlaceholderText(t('cart:promoCode.placeholder'));
        const submitButton = screen.getByRole('button', { name: t('cart:promoCode.apply') });

        await user.type(input, 'a');
        await user.click(submitButton);

        expect(screen.getByText(t('cart:promoCode.validation.minLength'))).toBeInTheDocument();
        expect(addAction).not.toHaveBeenCalled();
    });

    test('submits valid promo code to the add action', async () => {
        const user = userEvent.setup();
        const addAction = vi.fn(async ({ request }: ActionFunctionArgs) => {
            const fd = await request.formData();
            return { success: true, code: fd.get('promoCode') };
        });
        renderWithFetcherActions({ addAction });

        const input = screen.getByPlaceholderText(t('cart:promoCode.placeholder'));
        await user.type(input, 'SAVE20');
        await user.click(screen.getByRole('button', { name: t('cart:promoCode.apply') }));

        await waitFor(() => expect(addAction).toHaveBeenCalledOnce());
    });

    test('shows loading state while the add action is in flight', async () => {
        const user = userEvent.setup();
        const gate = deferred<{ success: true }>();
        renderWithFetcherActions({ addAction: () => gate.promise });

        await user.type(screen.getByPlaceholderText(t('cart:promoCode.placeholder')), 'SAVE20');
        await user.click(screen.getByRole('button', { name: t('cart:promoCode.apply') }));

        // While the action is pending, the apply button shows the loading label and is disabled.
        const applyingButton = await screen.findByRole('button', { name: t('cart:promoCode.applying') });
        expect(applyingButton).toBeDisabled();

        gate.resolve({ success: true });
    });

    test('shows success toast on successful apply', async () => {
        const user = userEvent.setup();
        renderWithFetcherActions({ addAction: () => ({ success: true }) });

        await user.type(screen.getByPlaceholderText(t('cart:promoCode.placeholder')), 'SAVE20');
        await user.click(screen.getByRole('button', { name: t('cart:promoCode.apply') }));

        // Sonner renders the toast text into the document; assert against the rendered string.
        expect(await findToast(t('cart:promoCode.successMessage'))).toBeInTheDocument();
    });

    test('publishes the action-response basket into BasketProvider on successful apply', async () => {
        const user = userEvent.setup();
        const responseBasket = { basketId: 'test-basket-id', lastModified: '2026-06-24T10:00:00.000Z' };
        renderWithFetcherActions({ addAction: () => ({ success: true, basket: responseBasket }) });

        await user.type(screen.getByPlaceholderText(t('cart:promoCode.placeholder')), 'SAVE20');
        await user.click(screen.getByRole('button', { name: t('cart:promoCode.apply') }));

        await waitFor(() => expect(mockUpdateBasket).toHaveBeenCalledWith(responseBasket));
    });

    test('does not publish a basket when the apply response carries none', async () => {
        const user = userEvent.setup();
        renderWithFetcherActions({ addAction: () => ({ success: true }) });

        await user.type(screen.getByPlaceholderText(t('cart:promoCode.placeholder')), 'SAVE20');
        await user.click(screen.getByRole('button', { name: t('cart:promoCode.apply') }));

        expect(await findToast(t('cart:promoCode.successMessage'))).toBeInTheDocument();
        expect(mockUpdateBasket).not.toHaveBeenCalled();
    });

    test('does not publish a basket on a failed apply', async () => {
        const user = userEvent.setup();
        renderWithFetcherActions({
            addAction: () => ({ success: false, basket: { basketId: 'test-basket-id' } }),
        });

        await user.type(screen.getByPlaceholderText(t('cart:promoCode.placeholder')), 'INVALID');
        await user.click(screen.getByRole('button', { name: t('cart:promoCode.apply') }));

        expect(await findToast(t('cart:promoCode.errorMessage'))).toBeInTheDocument();
        expect(mockUpdateBasket).not.toHaveBeenCalled();
    });

    test('surfaces the server status-specific error message on apply failure', async () => {
        const user = userEvent.setup();
        // A valid-but-ineligible coupon: SCAPI returns statusCode
        // 'no_applicable_promotion', which the add action maps to this
        // invalidCode message (the same one returned for unknown/disabled codes
        // and for a code SCAPI rejects outright, so the form can't be used to
        // tell which codes exist). The message echoes the shopper's own code via
        // the `{{code}}` placeholder.
        const serverMessage = t('cart:promoCode.errors.invalidCode', { code: 'INELIGIBLE' });
        renderWithFetcherActions({
            addAction: () => ({ success: false, error: { code: 'INVALID_INPUT', message: serverMessage } }),
        });

        await user.type(screen.getByPlaceholderText(t('cart:promoCode.placeholder')), 'INELIGIBLE');
        await user.click(screen.getByRole('button', { name: t('cart:promoCode.apply') }));

        // The server message is rendered in both the inline form error and the toast.
        // Scope to the toast region so the assertion is unambiguous.
        expect(await findToast(serverMessage)).toBeInTheDocument();
    });

    test('falls back to the generic error toast when the apply response has no message', async () => {
        const user = userEvent.setup();
        renderWithFetcherActions({ addAction: () => ({ success: false }) });

        await user.type(screen.getByPlaceholderText(t('cart:promoCode.placeholder')), 'INVALID');
        await user.click(screen.getByRole('button', { name: t('cart:promoCode.apply') }));

        expect(await findToast(t('cart:promoCode.errorMessage'))).toBeInTheDocument();
    });

    test('shows error when no basket ID provided', async () => {
        const user = userEvent.setup();
        const addAction = vi.fn(() => ({ success: true }));
        renderWithFetcherActions({ basket: {}, addAction });

        await user.type(screen.getByPlaceholderText(t('cart:promoCode.placeholder')), 'SAVE20');
        await user.click(screen.getByRole('button', { name: t('cart:promoCode.apply') }));

        expect(screen.getByText(t('cart:promoCode.noBasketMessage'))).toBeInTheDocument();
        expect(addAction).not.toHaveBeenCalled();
    });

    test('resets form when accordion trigger is clicked', async () => {
        const user = userEvent.setup();
        renderWithFetcherActions();

        const accordionTrigger = screen.getByRole('button', { name: t('cart:promoCode.accordionTitle') });
        const input = screen.getByPlaceholderText(t('cart:promoCode.placeholder'));

        await user.type(input, 'SAVE20');
        expect(input).toHaveValue('SAVE20');

        await user.click(accordionTrigger); // close
        await user.click(accordionTrigger); // reopen

        const resetInput = screen.getByPlaceholderText(t('cart:promoCode.placeholder'));
        expect(resetInput).toHaveValue('');
    });

    describe('applied coupons - remove flow', () => {
        const couponBasket = (couponItems: CouponItemFixture[]) => ({
            basketId: 'test-basket-id',
            couponItems,
        });

        test('does not render coupons that were added but not applied (e.g. no_applicable_promotion)', () => {
            renderWithFetcherActions({
                basket: couponBasket([
                    { couponItemId: 'ci-1', code: 'APPLIED', statusCode: 'applied' },
                    { couponItemId: 'ci-2', code: 'INELIGIBLE', statusCode: 'no_applicable_promotion' },
                    { couponItemId: 'ci-3', code: 'BOGUS', statusCode: 'coupon_code_unknown' },
                ]),
            });

            // Only the genuinely-applied coupon is presented to the shopper.
            expect(screen.getByText('APPLIED')).toBeInTheDocument();
            expect(screen.queryByText('INELIGIBLE')).not.toBeInTheDocument();
            expect(screen.queryByText('BOGUS')).not.toBeInTheDocument();
            const removeButtons = screen.getAllByRole('button', {
                name: new RegExp(`^${t('cart:promoCode.remove')}\\s`),
            });
            expect(removeButtons).toHaveLength(1);
        });

        test('does not render the applied-coupons container when no coupon is applied', () => {
            renderWithFetcherActions({
                basket: couponBasket([
                    { couponItemId: 'ci-1', code: 'INELIGIBLE', statusCode: 'no_applicable_promotion' },
                ]),
            });

            expect(screen.queryByTestId('applied-coupons')).not.toBeInTheDocument();
        });

        test('renders the coupon code and a remove button for each applied coupon', () => {
            renderWithFetcherActions({
                basket: couponBasket([
                    { couponItemId: 'ci-1', code: '5TIES', statusCode: 'applied' },
                    { couponItemId: 'ci-2', code: 'SAVE10', statusCode: 'applied' },
                ]),
            });

            expect(screen.getByText('5TIES')).toBeInTheDocument();
            expect(screen.getByText('SAVE10')).toBeInTheDocument();
            const removeButtons = screen.getAllByRole('button', {
                name: new RegExp(`^${t('cart:promoCode.remove')}\\s`),
            });
            expect(removeButtons).toHaveLength(2);
        });

        test('clicking the remove (X) button submits to the remove action with the couponItemId', async () => {
            const user = userEvent.setup();
            let submittedCouponItemId: FormDataEntryValue | null = null;
            const removeAction = vi.fn(async ({ request }: ActionFunctionArgs) => {
                const fd = await request.formData();
                submittedCouponItemId = fd.get('couponItemId');
                return { success: true };
            });
            renderWithFetcherActions({
                basket: couponBasket([{ couponItemId: 'ci-1', code: '5TIES', statusCode: 'applied' }]),
                removeAction,
            });

            await user.click(screen.getByRole('button', { name: new RegExp(`^${t('cart:promoCode.remove')}\\s`) }));

            await waitFor(() => expect(removeAction).toHaveBeenCalledOnce());
            expect(submittedCouponItemId).toBe('ci-1');
        });

        test('disables only the X button for the coupon currently being removed (per-row fetchers)', async () => {
            const user = userEvent.setup();
            const gate = deferred<{ success: true }>();
            // Both rows submit to the same action route, but only the row that's mid-flight
            // should be disabled — its own keyed/independent fetcher is in `submitting`.
            const removeAction = vi.fn(async ({ request }: ActionFunctionArgs) => {
                const fd = await request.formData();
                if (fd.get('couponItemId') === 'ci-1') {
                    return await gate.promise;
                }
                return { success: true };
            });

            renderWithFetcherActions({
                basket: couponBasket([
                    { couponItemId: 'ci-1', code: '5TIES', statusCode: 'applied' },
                    { couponItemId: 'ci-2', code: 'SAVE10', statusCode: 'applied' },
                ]),
                removeAction,
            });

            const [ci1RemoveButton, ci2RemoveButton] = screen.getAllByRole('button', {
                name: new RegExp(`^${t('cart:promoCode.remove')}\\s`),
            });
            // Click ci-1's X. Its row's fetcher transitions to submitting; the action is gated.
            await user.click(ci1RemoveButton);

            // ci-1 disabled, ci-2 still enabled — concurrent removal is supported.
            await waitFor(() => expect(ci1RemoveButton).toBeDisabled());
            expect(ci2RemoveButton).toBeEnabled();

            gate.resolve({ success: true });
        });

        test('two removes can be in flight concurrently and both complete independently', async () => {
            const user = userEvent.setup();
            // Independent gates: each coupon's remove waits on its own promise.
            // If sibling fetchers were shared (the original bug), clicking ci-2 while ci-1
            // is still in flight would be silently dropped by the hook's concurrency guard.
            const ci1Gate = deferred<{ success: true }>();
            const ci2Gate = deferred<{ success: true }>();
            const completedIds: string[] = [];
            const removeAction = vi.fn(async ({ request }: ActionFunctionArgs) => {
                const fd = await request.formData();
                const id = fd.get('couponItemId');
                if (id === 'ci-1') await ci1Gate.promise;
                if (id === 'ci-2') await ci2Gate.promise;
                completedIds.push(String(id));
                return { success: true };
            });

            renderWithFetcherActions({
                basket: couponBasket([
                    { couponItemId: 'ci-1', code: '5TIES', statusCode: 'applied' },
                    { couponItemId: 'ci-2', code: 'SAVE10', statusCode: 'applied' },
                ]),
                removeAction,
            });

            const [ci1RemoveButton, ci2RemoveButton] = screen.getAllByRole('button', {
                name: new RegExp(`^${t('cart:promoCode.remove')}\\s`),
            });

            // Fire both removes before either action resolves.
            await user.click(ci1RemoveButton);
            await user.click(ci2RemoveButton);

            // Both submissions reached the action — proves ci-2's click wasn't dropped while ci-1 was in flight.
            await waitFor(() => expect(removeAction).toHaveBeenCalledTimes(2));

            // Resolve in reverse order to also prove the two fetchers are independent (not serialized via shared state).
            ci2Gate.resolve({ success: true });
            ci1Gate.resolve({ success: true });

            await waitFor(() => expect(completedIds).toEqual(expect.arrayContaining(['ci-1', 'ci-2'])));
        });

        test('shows success toast after a successful removal', async () => {
            const user = userEvent.setup();
            renderWithFetcherActions({
                basket: couponBasket([{ couponItemId: 'ci-1', code: '5TIES', statusCode: 'applied' }]),
                removeAction: () => ({ success: true }),
            });

            await user.click(screen.getByRole('button', { name: new RegExp(`^${t('cart:promoCode.remove')}\\s`) }));

            expect(await findToast(t('cart:promoCode.removeSuccessMessage'))).toBeInTheDocument();
        });

        test('publishes the action-response basket into BasketProvider on successful removal', async () => {
            const user = userEvent.setup();
            const responseBasket = { basketId: 'test-basket-id', lastModified: '2026-06-24T10:00:00.000Z' };
            renderWithFetcherActions({
                basket: couponBasket([{ couponItemId: 'ci-1', code: '5TIES', statusCode: 'applied' }]),
                removeAction: () => ({ success: true, basket: responseBasket }),
            });

            await user.click(screen.getByRole('button', { name: new RegExp(`^${t('cart:promoCode.remove')}\\s`) }));

            await waitFor(() => expect(mockUpdateBasket).toHaveBeenCalledWith(responseBasket));
        });

        test('does not publish a basket on a failed removal', async () => {
            const user = userEvent.setup();
            renderWithFetcherActions({
                basket: couponBasket([{ couponItemId: 'ci-1', code: '5TIES', statusCode: 'applied' }]),
                removeAction: () => ({ success: false, error: { code: 'OPERATION_FAILED', message: 'oops' } }),
            });

            await user.click(screen.getByRole('button', { name: new RegExp(`^${t('cart:promoCode.remove')}\\s`) }));

            expect(await findToast(t('cart:promoCode.removeErrorMessage'))).toBeInTheDocument();
            expect(mockUpdateBasket).not.toHaveBeenCalled();
        });

        test('shows error toast when removal fails', async () => {
            const user = userEvent.setup();
            renderWithFetcherActions({
                basket: couponBasket([{ couponItemId: 'ci-1', code: '5TIES', statusCode: 'applied' }]),
                removeAction: () => ({ success: false, error: { code: 'OPERATION_FAILED', message: 'oops' } }),
            });

            await user.click(screen.getByRole('button', { name: new RegExp(`^${t('cart:promoCode.remove')}\\s`) }));

            expect(await findToast(t('cart:promoCode.removeErrorMessage'))).toBeInTheDocument();
        });
    });

    describe('stale apply error clears when the parked coupon auto-applies (W-23198531)', () => {
        /**
         * Locate the inline field error rendered by <FormMessage>, scoped to the
         * promo-code form so it's never confused with the Sonner toast that shows
         * the same message string.
         */
        const findInlineError = async (text: string) =>
            waitFor(() => {
                const form = screen.getByTestId('promo-code-form');
                const match = within(form).queryByText(text);
                if (!match) {
                    throw new Error(`No inline form error found with text: ${text}`);
                }
                return match;
            });

        const queryInlineError = (text: string) => within(screen.getByTestId('promo-code-form')).queryByText(text);

        /** Submit a code that the add action rejects, leaving an inline error. */
        const submitFailingCode = async (code: string) => {
            const user = userEvent.setup();
            await user.type(screen.getByPlaceholderText(t('cart:promoCode.placeholder')), code);
            await user.click(screen.getByRole('button', { name: t('cart:promoCode.apply') }));
        };

        test('clears the inline error once the failed code appears among applied coupons', async () => {
            const errorMessage = t('cart:promoCode.errors.invalidCode', { code: '5TIES' });
            const { setBasket } = renderWithFetcherActions({
                basket: { basketId: 'test-basket-id' },
                addAction: () => ({ success: false, error: { code: 'INVALID_INPUT', message: errorMessage } }),
            });

            // 1. Apply a valid-but-ineligible coupon → inline error shows.
            await submitFailingCode('5TIES');
            expect(await findInlineError(errorMessage)).toBeInTheDocument();

            // 2. Shopper swaps to a qualifying variant: the cart loader revalidates
            //    and the parked coupon now reports `applied`. The apply fetcher does
            //    NOT re-fire — only the basket prop changes.
            setBasket({
                basketId: 'test-basket-id',
                couponItems: [{ couponItemId: 'ci-1', code: '5TIES', statusCode: 'applied' }],
            });

            // 3. Inline error is gone and the applied-coupon badge renders.
            await waitFor(() => expect(queryInlineError(errorMessage)).not.toBeInTheDocument());
            expect(within(screen.getByTestId('applied-coupons')).getByText('5TIES')).toBeInTheDocument();
        });

        test('matches the applied coupon case-insensitively', async () => {
            const errorMessage = t('cart:promoCode.errors.invalidCode', { code: '5ties' });
            const { setBasket } = renderWithFetcherActions({
                basket: { basketId: 'test-basket-id' },
                addAction: () => ({ success: false, error: { code: 'INVALID_INPUT', message: errorMessage } }),
            });

            // Shopper types a lowercase code; SCAPI returns the canonical uppercase.
            await submitFailingCode('5ties');
            expect(await findInlineError(errorMessage)).toBeInTheDocument();

            setBasket({
                basketId: 'test-basket-id',
                couponItems: [{ couponItemId: 'ci-1', code: '5TIES', statusCode: 'applied' }],
            });

            await waitFor(() => expect(queryInlineError(errorMessage)).not.toBeInTheDocument());
        });

        test('does NOT clear the error when an unrelated coupon applies', async () => {
            const errorMessage = t('cart:promoCode.errors.invalidCode', { code: 'BADCODE' });
            const { setBasket } = renderWithFetcherActions({
                basket: { basketId: 'test-basket-id' },
                addAction: () => ({ success: false, error: { code: 'INVALID_INPUT', message: errorMessage } }),
            });

            // BADCODE fails and owns the inline error.
            await submitFailingCode('BADCODE');
            expect(await findInlineError(errorMessage)).toBeInTheDocument();

            // A *different* coupon becomes applied (e.g. one added elsewhere). The
            // error for BADCODE must survive — it never became applicable.
            setBasket({
                basketId: 'test-basket-id',
                couponItems: [{ couponItemId: 'ci-1', code: 'SAVE10', statusCode: 'applied' }],
            });

            // Give the effect a chance to (wrongly) fire, then assert the error stayed.
            expect(within(screen.getByTestId('applied-coupons')).getByText('SAVE10')).toBeInTheDocument();
            expect(queryInlineError(errorMessage)).toBeInTheDocument();
        });
    });
});
