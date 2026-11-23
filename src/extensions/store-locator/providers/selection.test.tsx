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
/** @sfdc-extension-file SFDC_EXT_STORE_LOCATOR */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { memo, createContext } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StoreLocatorProvider, { useStoreLocator } from './store-locator';
import { useStoreSelection } from './selection';
import StoreLocator from '@/extensions/store-locator/components/store-locator';
import { StoreLocatorLayoutProvider } from '@/extensions/store-locator/context/layout';
import ChangeStoreButton from '@/components/store-preferences/preferred-store/change-store-button';

vi.mock('@salesforce/storefront-next-runtime/config', () => ({ useConfig: () => ({ features: {} }) }));
const mocks = vi.hoisted(() => ({
    site: 'site',
    preference: { state: 'idle', data: undefined as unknown, submit: vi.fn() },
    pickup: { state: 'idle', data: undefined as unknown, submit: vi.fn() },
    search: {} as Record<string, unknown>,
    revalidate: vi.fn(),
    reconciliation: {
        status: 'idle' as 'idle' | 'reconciling' | 'unresolved',
        scope: {},
        isCurrentScope: vi.fn<(scope: object) => boolean>(),
        reconcile: vi.fn<(scope?: object) => Promise<undefined>>(),
    },
}));
vi.mock('@/providers/basket', () => ({ useBasketReconciliation: () => mocks.reconciliation }));
vi.mock('@/extensions/store-locator/components/store-locator/form', () => ({ default: () => null }));
vi.mock('@/extensions/store-locator/hooks/use-store-locator-list', () => ({
    useStoreLocatorList: () => ({
        mode: 'device',
        config: { supportedCountries: [], radius: 10, radiusUnit: 'mi' },
        hasSearched: true,
        stores: [],
        storesPaginated: [],
        ...mocks.search,
    }),
}));
vi.mock('@/extensions/store-locator/hooks/use-luxury-store-locator-list', () => ({
    useStoreLocatorList: () => ({ stores: [], ...mocks.search }),
}));
vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<typeof import('react-router')>()),
    UNSAFE_DataRouterContext: createContext({}),
    useRevalidator: () => ({ revalidate: mocks.revalidate, state: 'idle' }),
    useFormAction: () => '/',
    useFetcher: ({ key = '' }: { key?: string } = {}) => ({
        ...(key.startsWith('store-locator-selected-store:') ? mocks.preference : mocks.pickup),
    }),
}));
vi.mock('@salesforce/storefront-next-runtime/site-context', () => ({ useSite: () => ({ site: { id: mocks.site } }) }));

function Chooser() {
    const { select } = useStoreSelection();
    return <button onClick={() => select({ id: 'new', inventoryId: 'untrusted' })}>Save</button>;
}
function Initiator() {
    const open = useStoreLocator((state) => state.openChooser);
    return (
        <button
            onClick={() =>
                open({
                    owner: 'pickup-caller',
                })
            }>
            Pickup
        </button>
    );
}
function Observer() {
    const selected = useStoreLocator((state) => state.selectedStoreInfo);
    const open = useStoreLocator((state) => state.open);
    const close = useStoreLocator((state) => state.close);
    const { select } = useStoreSelection();
    return (
        <>
            <output>{selected?.id ?? 'none'}</output>
            <button onClick={() => open()}>Open</button>
            <button onClick={() => close()}>Close</button>
            <button onClick={() => select(null)}>Clear</button>
        </>
    );
}

describe('mounted selection coordinator', () => {
    it('renders one account retry and suppresses the provider fallback', () => {
        const account = () => (
            <StoreLocatorProvider>
                <Observer />
                <ChangeStoreButton />
            </StoreLocatorProvider>
        );
        const { rerender } = render(account());
        fireEvent.click(screen.getByText('Clear'));
        mocks.preference.data = { success: false };
        rerender(account());
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1);
    });

    it('keeps keyboard focus on the account retry while a failed clear is retried and fails again', () => {
        const account = () => (
            <StoreLocatorProvider>
                <Observer />
                <ChangeStoreButton />
            </StoreLocatorProvider>
        );
        const { rerender } = render(account());
        fireEvent.click(screen.getByText('Clear'));
        mocks.preference.data = { success: false };
        rerender(account());
        const retry = screen.getByRole('button', { name: 'Try again' });
        retry.focus();
        fireEvent.click(retry);
        const pendingRetry = screen.getByRole('button', { name: 'Try again' });
        expect(pendingRetry).toBe(retry);
        expect(pendingRetry).toHaveFocus();
        expect(pendingRetry).toHaveAttribute('aria-disabled', 'true');
        mocks.preference.data = { success: false };
        rerender(account());
        expect(screen.getByRole('button', { name: 'Try again' })).toHaveFocus();
    });

    it('does not rerender action-only consumers or change callbacks on fetcher/context host updates', () => {
        const renders: ReturnType<typeof useStoreSelection>[] = [];
        const Consumer = memo(function Consumer() {
            const actions = useStoreSelection();
            renders.push(actions);
            return <button onClick={() => actions.select({ id: 'new' })}>Stable save</button>;
        });
        const child = <Consumer />;
        const tree = () => <StoreLocatorProvider>{child}</StoreLocatorProvider>;
        const { rerender } = render(tree());
        const initial = renders.length;
        mocks.preference.state = 'submitting';
        rerender(tree());
        mocks.pickup.state = 'loading';
        rerender(tree());
        expect(renders).toHaveLength(initial);
        expect(renders.at(-1)?.select).toBe(renders[0].select);
        expect(renders.at(-1)?.retry).toBe(renders[0].retry);
        const latestSubmit = vi.fn();
        mocks.preference.submit = latestSubmit;
        mocks.preference.state = mocks.pickup.state = 'idle';
        rerender(tree());
        fireEvent.click(screen.getByText('Stable save'));
        expect(latestSubmit).toHaveBeenCalledTimes(1);
    });
    const confirmed = { id: 'old' };
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.site = 'site';
        mocks.preference.state = mocks.pickup.state = 'idle';
        mocks.preference.data = mocks.pickup.data = undefined;
        mocks.search = {};
        mocks.reconciliation.scope = {};
        mocks.reconciliation.status = 'idle';
        mocks.reconciliation.isCurrentScope.mockImplementation((scope) => scope === mocks.reconciliation.scope);
        mocks.reconciliation.reconcile.mockResolvedValue(undefined);
    });
    const tree = (identity = 'A', chooser = true, initiator = true, resolutionError = false) => (
        <StoreLocatorProvider
            identity={identity}
            selectedStoreInfo={resolutionError ? null : confirmed}
            resolutionError={resolutionError}>
            <Observer />
            {chooser && <Chooser />}
            {initiator && <Initiator />}
        </StoreLocatorProvider>
    );

    it('holds preference pending across unmount and cancels notification on manual close', () => {
        const { rerender } = render(tree());
        expect(mocks.preference.submit).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText('Pickup'));
        fireEvent.click(screen.getByText('Save'));
        expect(screen.getByRole('status', { hidden: true })).toHaveTextContent('old');
        mocks.preference.state = 'submitting';
        rerender(tree());
        fireEvent.click(screen.getByText('Close'));
        rerender(tree('A', false, false));
        fireEvent.click(screen.getByText('Clear'));
        expect(mocks.preference.submit).toHaveBeenCalledTimes(1);
        mocks.preference.data = { success: true, selectedStoreInfo: { id: 'new', inventoryId: 'canonical' } };
        mocks.preference.state = 'loading';
        rerender(tree('A', false, false));
        expect(mocks.pickup.submit).not.toHaveBeenCalled();
        mocks.preference.state = 'idle';
        rerender(tree('A', false, false));
        expect(screen.getByText('new')).toBeInTheDocument();
        expect(mocks.pickup.submit).not.toHaveBeenCalled();
        mocks.preference.state = 'idle';
        rerender(tree('A', false, false));
        expect(mocks.pickup.submit).not.toHaveBeenCalled();
    });

    it('leaves selection/basket unchanged on failure and exposes retry after closing', () => {
        const { rerender } = render(tree());
        fireEvent.click(screen.getByText('Pickup'));
        fireEvent.click(screen.getByText('Save'));
        fireEvent.click(screen.getByText('Close'));
        mocks.preference.data = { success: false, error: 'persistence_failed' };
        rerender(tree('A', false, false));
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('old')).toBeInTheDocument();
        expect(mocks.pickup.submit).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(mocks.preference.submit).toHaveBeenCalledTimes(2);
    });

    it.each(['identity', 'site'])('ignores old %s responses and pickup intentions', (scope) => {
        const { rerender } = render(tree());
        fireEvent.click(screen.getByText('Pickup'));
        fireEvent.click(screen.getByText('Save'));
        if (scope === 'site') mocks.site = 'other';
        rerender(tree(scope === 'identity' ? 'B' : 'A'));
        mocks.preference.data = { success: true, selectedStoreInfo: { id: 'new', inventoryId: 'canonical' } };
        rerender(tree(scope === 'identity' ? 'B' : 'A'));
        expect(screen.getByText('old')).toBeInTheDocument();
        expect(mocks.pickup.submit).not.toHaveBeenCalled();
    });

    it('retains same-scope confirmed selection on transient root resolution errors', () => {
        const { rerender } = render(tree());
        act(() => rerender(tree('A', true, true, true)));
        expect(screen.getByText('old')).toBeInTheDocument();
    });

    it('never submits basket operations for a preference-only chooser', () => {
        const { rerender } = render(tree());
        fireEvent.click(screen.getByText('Open'));
        fireEvent.click(screen.getByText('Save'));
        mocks.preference.data = { success: true, selectedStoreInfo: { id: 'new', inventoryId: 'canonical' } };
        rerender(tree());
        expect(screen.getByText('new')).toBeInTheDocument();
        expect(mocks.pickup.submit).not.toHaveBeenCalled();
    });

    it('never inherits canceled pickup intent on a standalone-page selection', () => {
        const { rerender } = render(tree());
        fireEvent.click(screen.getByText('Pickup'));
        fireEvent.click(screen.getByText('Close'));
        fireEvent.click(screen.getByText('Save'));
        mocks.preference.data = { success: true, selectedStoreInfo: { id: 'new', inventoryId: 'canonical' } };
        rerender(tree());
        expect(mocks.pickup.submit).not.toHaveBeenCalled();
    });

    it.each([
        { hasSearched: false },
        { isLoading: true },
        { hasError: true },
        { geoError: true },
        { stores: [], storesPaginated: [] },
    ])('keeps exactly one accessible retry in the chooser shell for search state %j', (search) => {
        mocks.search = search;
        const shell = () => (
            <StoreLocatorProvider>
                <Observer />
                <Chooser />
                <StoreLocator />
                <StoreLocatorLayoutProvider forceMobile>
                    <StoreLocator />
                </StoreLocatorLayoutProvider>
            </StoreLocatorProvider>
        );
        const { rerender } = render(shell());
        fireEvent.click(screen.getByText('Open'));
        fireEvent.click(screen.getByText('Save'));
        mocks.preference.data = { success: false };
        rerender(shell());
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1);
        fireEvent.click(screen.getByText('Close'));
        expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1);
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(mocks.preference.submit).toHaveBeenCalledTimes(2);
    });
});
