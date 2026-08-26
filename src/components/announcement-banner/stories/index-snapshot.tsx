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
import type { ComponentType, ReactElement, ReactNode } from 'react';
import { vi, expect, test, describe, afterEach } from 'vitest';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import i18next from 'i18next';
import { composeStories } from '@storybook/react-vite';
import { render, cleanup } from '@testing-library/react';
import { mockConfig, mockSiteObject, mockLocale } from '@/test-utils/config';
import resources from '@/locales';
import * as AnnouncementBannerStories from './index.stories';

void i18next.use(initReactI18next).init({
    lng: 'en-GB',
    fallbackLng: 'en-GB',
    resources,
    interpolation: { escapeValue: false },
});

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return {
        ...actual,
        useNavigate: () => vi.fn(),
        useLocation: () => ({ pathname: '/', search: '', hash: '', state: null, key: 'default' }),
        useResolvedPath: () => ({ pathname: '/', search: '', hash: '' }),
        useHref: () => '/',
        useSearchParams: () => [new URLSearchParams(), vi.fn()],
        Link: (props: { to?: string; children?: ReactNode }) => (
            <a href={props.to} {...props}>
                {props.children}
            </a>
        ),
        NavLink: (props: { to?: string; children?: ReactNode }) => (
            <a href={props.to} {...props}>
                {props.children}
            </a>
        ),
    };
});

const composed = composeStories(AnnouncementBannerStories);

function SnapshotShell({ children }: { children: ReactNode }): ReactElement {
    return (
        <ConfigProvider config={mockConfig}>
            <I18nextProvider i18n={i18next}>
                <SiteProvider
                    site={mockSiteObject}
                    locale={mockLocale}
                    language={mockSiteObject.defaultLocale}
                    currency={mockSiteObject.defaultCurrency}>
                    {children}
                </SiteProvider>
            </I18nextProvider>
        </ConfigProvider>
    );
}

afterEach(() => {
    cleanup();
});

type ComposedStory = ComponentType & { parameters?: { snapshot?: boolean } };

describe('AnnouncementBanner stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed) as [string, ComposedStory][]) {
        // Interaction-only stories opt out of snapshotting. The design-mode empty state renders
        // its children inside a lazy Suspense provider that resolves in a live browser but suspends
        // to a fallback in this synchronous render — so its DOM is not deterministically snapshottable.
        if (Story?.parameters?.snapshot === false) continue;
        test(`${storyName} story renders and matches snapshot`, () => {
            const { container } = render(
                <SnapshotShell>
                    <Story />
                </SnapshotShell>
            );
            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
