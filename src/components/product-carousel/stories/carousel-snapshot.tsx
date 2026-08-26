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
import type { ReactElement, ReactNode } from 'react';
import { vi, expect, test, describe, afterEach } from 'vitest';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import { composeStories } from '@storybook/react-vite';
import * as CarouselStories from './carousel.stories';
import { render, cleanup } from '@testing-library/react';
import { mockConfig, mockSiteObject } from '@/test-utils/config';

// Hoisted mock (must not live inside describe) so CI and local Vitest resolve react-router the same way.
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return {
        ...actual,
        useNavigate: () => vi.fn(),
        useLocation: () => ({
            pathname: '/',
            search: '',
            hash: '',
            state: null,
            key: 'default',
        }),
        useResolvedPath: () => ({ pathname: '/', search: '', hash: '' }),
        useHref: () => '/',
        useSearchParams: () => [new URLSearchParams(), vi.fn()],
        // useFetcher is required by WishlistButton (useWishlist) and QuickAddButton (CartItemModal)
        useFetcher: () => ({
            state: 'idle',
            data: undefined,
            errors: undefined,
            submit: vi.fn(),
            load: vi.fn(),
            Form: (props: Record<string, unknown>) => <form {...props} />,
            formMethod: undefined,
            formAction: undefined,
            formData: undefined,
            formEncType: undefined,
            json: undefined,
            text: undefined,
        }),
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

const composed = composeStories(CarouselStories);

/**
 * Ensures site + i18n context exist for `@/components/link` `buildUrl` even if portable-story
 * decorator ordering differs between environments (matches Storybook preview + .storybook/test-utils SITE_PREFIX).
 */
function SnapshotShell({ children }: { children: ReactNode }): ReactElement {
    return (
        <ConfigProvider config={mockConfig}>
            <I18nextProvider i18n={i18next}>
                <SiteProvider value={mockSiteObject}>{children}</SiteProvider>
            </I18nextProvider>
        </ConfigProvider>
    );
}

afterEach(() => {
    cleanup();
});

describe('ProductCarousel stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
        // Design-mode stories render inside PageDesignerProvider's lazy Suspense provider, which does
        // not resolve deterministically in a synchronous snapshot render — they opt out via `snapshot: false`.
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
