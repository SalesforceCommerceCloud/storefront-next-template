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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockSubmit = vi.fn();

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<object>();
    return {
        ...actual,
        useFormAction: () => '.',
        useFetcher: () => ({
            data: null,
            state: 'idle',
            submit: mockSubmit,
            Form: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
                <form {...props}>{children}</form>
            ),
        }),
    };
});

import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockAltSiteObject, mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';
import SiteSwitcher from './index';
import { resourceRoutes } from '@/route-paths';

const site = mockSiteObject;
const siteWithAlias = { ...site, alias: mockConfig.siteAliasMap?.[site.id] };

function renderSiteSwitcher(configOverride?: typeof mockConfig) {
    const config = configOverride ?? mockConfig;
    return render(
        <ConfigProvider config={config}>
            <SiteProvider
                site={siteWithAlias}
                locale={mockLocale}
                language={mockSiteObject.defaultLocale}
                currency={mockSiteObject.defaultCurrency}>
                <SiteSwitcher />
            </SiteProvider>
        </ConfigProvider>
    );
}

describe('SiteSwitcher', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders a select element with the site picker aria label', () => {
        renderSiteSwitcher();
        expect(screen.getByRole('combobox', { name: /select site/i })).toBeInTheDocument();
    });

    it('renders an option for each configured site', () => {
        renderSiteSwitcher();
        const select = screen.getByRole('combobox', { name: /select site/i });
        const options = select.querySelectorAll('option');
        expect(options).toHaveLength(mockConfig.commerce.sites.length);
    });

    it('displays the site IDs as option values', () => {
        renderSiteSwitcher();
        const options = screen.getAllByRole('option');
        for (const s of mockConfig.commerce.sites) {
            const option = options.find((o) => o.getAttribute('value') === s.id);
            expect(option).toBeDefined();
        }
    });

    it('selects the current site from context', () => {
        renderSiteSwitcher();
        const select = screen.getByRole('combobox', { name: /select site/i });
        expect(select).toHaveValue(site.id);
    });

    it('renders both sites from mockConfig', () => {
        renderSiteSwitcher();
        const options = screen.getByRole('combobox', { name: /select site/i }).querySelectorAll('option');
        expect(options).toHaveLength(2);
    });

    it('submits to /action/set-site-context when a different site is selected', async () => {
        renderSiteSwitcher();

        const select = screen.getByRole('combobox', { name: /select site/i });
        await userEvent.selectOptions(select, mockAltSiteObject.id);

        expect(mockSubmit).toHaveBeenCalledWith(expect.any(FormData), {
            method: 'POST',
            action: resourceRoutes.setSiteContext,
        });

        const formData = mockSubmit.mock.calls[0][0] as FormData;
        expect(formData.get('type')).toBe('site');
        expect(JSON.parse(formData.get('payload') as string)).toEqual({ siteId: mockAltSiteObject.id });
    });
});
