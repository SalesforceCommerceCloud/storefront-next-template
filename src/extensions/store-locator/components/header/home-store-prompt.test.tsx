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
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import HomeStorePrompt from './home-store-prompt';
import { getHomeStorePromptDismissalCookieName } from '@/extensions/store-locator/home-store-prompt-dismissal';
import { mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';

const { t } = getTranslation();
const openStoreLocator = vi.fn();
const state = {
    selectedStoreInfo: null as { id: string } | null,
    homeStorePromptDismissed: false,
    setHomeStorePromptDismissed: vi.fn(),
    isOpen: false,
    open: openStoreLocator,
};

vi.mock('@/extensions/store-locator/providers/store-locator', () => ({
    SelectedStoreBoundary: ({ children }: { children: () => ReactNode }) => children(),
    useStoreLocator: (selector: (store: typeof state) => unknown) => selector(state),
}));

function renderPrompt(initialEntry = '/global/en-GB', config = mockConfig) {
    return render(
        <ConfigProvider config={config}>
            <SiteProvider site={mockSiteObject} locale={mockLocale} language={mockLocale.id} currency="GBP">
                <MemoryRouter initialEntries={[initialEntry]}>
                    <HomeStorePrompt />
                </MemoryRouter>
            </SiteProvider>
        </ConfigProvider>
    );
}

describe('HomeStorePrompt', () => {
    beforeEach(() => {
        document.cookie = `${getHomeStorePromptDismissalCookieName(mockSiteObject.id)}=; Max-Age=0; Path=/`;
        openStoreLocator.mockClear();
        state.selectedStoreInfo = null;
        state.homeStorePromptDismissed = false;
        state.setHomeStorePromptDismissed.mockClear();
        state.isOpen = false;
    });

    test('renders for an unselected shopper on the home route and opens the shared sheet', async () => {
        renderPrompt('/global/en-GB');

        const prompt = await screen.findByTestId('store-locator-home-prompt');
        expect(prompt).toHaveAccessibleName(t('extStoreLocator:storeLocator.homePrompt.title'));
        expect(prompt).toHaveTextContent(t('extStoreLocator:storeLocator.homePrompt.description'));

        const openButton = screen.getByRole('button', { name: t('extStoreLocator:storeLocator.homePrompt.open') });
        expect(openButton).toHaveAttribute('aria-haspopup', 'dialog');
        expect(openButton).toHaveAttribute('aria-expanded', 'false');

        await userEvent.click(openButton);
        expect(openStoreLocator).toHaveBeenCalledOnce();
    });

    test('recognizes a home route for any configured prefix shape', async () => {
        renderPrompt('/en-GB', {
            ...mockConfig,
            url: { ...mockConfig.url, prefix: '/:localeId' },
        });

        expect(await screen.findByTestId('store-locator-home-prompt')).toBeInTheDocument();
    });

    test('reports the sheet as expanded while it is open', async () => {
        state.isOpen = true;
        renderPrompt('/global/en-GB');

        expect(
            await screen.findByRole('button', { name: t('extStoreLocator:storeLocator.homePrompt.open') })
        ).toHaveAttribute('aria-expanded', 'true');
    });

    test('hides after dismissal for the current browser session', async () => {
        renderPrompt('/site/en-US');

        await userEvent.click(
            await screen.findByRole('button', { name: t('extStoreLocator:storeLocator.homePrompt.dismiss') })
        );
        expect(screen.queryByTestId('store-locator-home-prompt')).not.toBeInTheDocument();
        expect(document.cookie).toContain(`${getHomeStorePromptDismissalCookieName(mockSiteObject.id)}=1`);
    });

    test('does not paint for a shopper who already dismissed it this session', () => {
        document.cookie = `${getHomeStorePromptDismissalCookieName(mockSiteObject.id)}=1; Path=/`;

        renderPrompt('/site/en-US');

        expect(screen.queryByTestId('store-locator-home-prompt')).not.toBeInTheDocument();
    });

    test('does not render when a store is selected or outside the home route', () => {
        state.selectedStoreInfo = { id: 'store-1' };
        renderPrompt('/global/en-GB');
        expect(screen.queryByTestId('store-locator-home-prompt')).not.toBeInTheDocument();

        state.selectedStoreInfo = null;
        renderPrompt('/site/en-US/cart');
        expect(screen.queryByTestId('store-locator-home-prompt')).not.toBeInTheDocument();
    });
});
