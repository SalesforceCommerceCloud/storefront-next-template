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
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';
import SiteSwitcher from '../index';

const site = mockSiteObject;
const siteWithAlias = { ...site, alias: mockConfig.siteAliasMap?.[site.id] };

const meta: Meta<typeof SiteSwitcher> = {
    title: 'Layout/Switchers/Site Switcher',
    component: SiteSwitcher,
    tags: ['autodocs', 'interaction'],
    parameters: {
        docs: {
            description: {
                component: `
A native \`<select>\` for switching between configured commerce sites. **Not currently used in production** — the bundled footer wires up only \`LocaleSwitcher\` and \`CurrencySwitcher\` (see \`footer/switchers.tsx\`). The component ships as a framework-provided primitive for customers building multi-site storefronts.

## What "site" means here

A **site** is a distinct storefront configured in \`config.commerce.sites\` — its own catalog, pricing, SEO config, and SCAPI routing. The bundled mock has two: \`RefArchGlobal\` ("Global (UK)") and \`RefArch\` ("United States").

Distinct from the sibling switchers:
- \`LocaleSwitcher\` changes the **language** within the same site (en-GB → it-IT).
- \`CurrencySwitcher\` changes the **currency** used to display prices within the same site.
- \`SiteSwitcher\` changes the **storefront itself** — different catalog, different pricing.

## How it works

1. User selects a site from the dropdown.
2. POSTs \`{ type: 'site', payload: { siteId } }\` to \`/action/set-site-context\` (server action that writes a cookie).
3. After the cookie is set, hard-redirects to \`/\` because pages may not exist on the new site.

## When customers wire it up

Customers who configure 2+ \`commerce.sites\` and want to expose a picker to shoppers can drop \`<SiteSwitcher />\` into the footer or header. The plan / Multi-Site README covers configuration; this component is the visible UI.

## Storybook coverage

Single \`Default\` story — Pattern 1 (production-usage trim): with zero production importers, the component is documentation-only, so we keep one representative variant rather than a full state matrix.
                `,
            },
        },
    },
    decorators: [
        (Story) => (
            <ConfigProvider config={mockConfig}>
                <SiteProvider
                    site={siteWithAlias}
                    locale={mockLocale}
                    language={mockSiteObject.defaultLocale}
                    currency={mockSiteObject.defaultCurrency}>
                    <Story />
                </SiteProvider>
            </ConfigProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Default renders with both sites from mockConfig (RefArchGlobal + RefArch). */
export const Default: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const select = await canvas.findByRole('combobox', {}, { timeout: 5000 });
        await expect(select).toHaveAttribute('aria-label');
    },
};
