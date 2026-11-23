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
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig } from '@/test-utils/config';
import french from '@/extensions/bopis/locales/fr-FR/translations.json';
import english from '@/extensions/bopis/locales/en-GB/translations.json';
import LocalAvailability from './local-availability';

const state = vi.hoisted(() => ({
    search: '?q=milk&inventoryStore=A',
    navigate: vi.fn(),
    open: vi.fn(),
    store: { id: 'A', inventoryId: 'list-A', name: 'Magasin de préparation – Londres' } as {
        id: string;
        inventoryId: string;
        name: string;
    } | null,
}));
vi.mock('@/hooks/use-navigate', () => ({ useNavigate: () => state.navigate }));
vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<typeof import('react-router')>()),
    useLocation: () => ({ pathname: '/search', search: state.search }),
    useNavigation: () => ({ state: 'idle' }),
}));
vi.mock('@/extensions/store-locator/providers/store-locator', () => ({
    SelectedStoreBoundary: ({ children }: { children: (store: typeof state.store) => React.ReactNode }) =>
        children(state.store),
    useStoreLocator: (selector: (value: unknown) => unknown) =>
        selector({ selectedStoreInfo: state.store, open: state.open }),
}));

function show(locale: 'en-GB' | 'fr-FR', verified = true) {
    const i18n = createInstance();
    void i18n.init({
        lng: locale,
        fallbackLng: 'en-GB',
        resources: { 'en-GB': { extBopis: english }, 'fr-FR': { extBopis: french } },
        initImmediate: false,
    });
    const tree = () => (
        <ConfigProvider
            config={{
                ...mockConfig,
                features: { ...mockConfig.features, localInventory: { enabled: true, nativeSearchVerified: verified } },
            }}>
            <I18nextProvider i18n={i18n}>
                <LocalAvailability />
            </I18nextProvider>
        </ConfigProvider>
    );
    const view = render(tree());
    return { ...view, refresh: () => view.rerender(tree()) };
}

beforeEach(() => {
    vi.clearAllMocks();
    state.search = '?q=milk&inventoryStore=A';
    state.store = { id: 'A', inventoryId: 'list-A', name: 'Magasin de préparation – Londres' };
});

describe.each(['en-GB', 'fr-FR'] as const)('local availability in %s', (locale) => {
    it('uses the English copy or its fallback, supports Space and retains focus', async () => {
        show(locale);
        const user = userEvent.setup();
        const checkbox = screen.getByRole('checkbox', {
            name: 'Show unavailable products',
        });
        expect(checkbox).toBeChecked();
        checkbox.focus();
        await user.keyboard(' ');
        expect(checkbox).toHaveFocus();
        const call = state.navigate.mock.calls.at(-1)?.[0] as { search: string };
        const params = new URLSearchParams(call.search);
        expect(params.get('q')).toBe('milk');
        expect(params.getAll('refine')).toEqual(['ilids=list-A', 'orderable_only=true']);
    });
    it('announces an unavailable filtering service without changing the result set', async () => {
        show(locale, false);
        const checkbox = screen.getByRole('checkbox');
        checkbox.focus();
        await userEvent.setup().keyboard(' ');
        expect(screen.getByRole('alert')).toHaveTextContent('Availability filtering');
        expect(checkbox).toHaveAccessibleDescription(screen.getByRole('alert').textContent ?? '');
        expect(checkbox).toBeChecked();
        expect(checkbox).toHaveFocus();
        expect(state.navigate).not.toHaveBeenCalled();
    });
    it('clears the previous store error after switching or clearing selection', async () => {
        const view = show(locale, false);
        await userEvent.setup().click(screen.getByRole('checkbox'));
        expect(screen.getByRole('alert')).toBeInTheDocument();
        state.store = { id: 'B', inventoryId: 'list-B', name: 'Store B' };
        view.refresh();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        await userEvent.setup().click(screen.getByRole('checkbox'));
        expect(screen.getByRole('alert')).toBeInTheDocument();
        state.store = null;
        view.refresh();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByRole('checkbox')).toBeDisabled();
    });
    it('clears obsolete inventory filters after deselection and leaves the choose-store button keyboard accessible', async () => {
        state.store = null;
        state.search = '?q=milk&inventoryStore=A&refine=ilids=list-A&refine=orderable_only=true&offset=24';
        show(locale);
        expect(screen.getByRole('checkbox')).toBeDisabled();
        const params = new URLSearchParams(state.navigate.mock.calls[0][0].search);
        expect(params.get('q')).toBe('milk');
        expect(params.has('refine')).toBe(false);
        expect(params.has('offset')).toBe(false);
        const button = screen.getByRole('button');
        button.focus();
        await userEvent.setup().keyboard('{Enter}');
        expect(state.open).toHaveBeenCalledWith();
    });
});
