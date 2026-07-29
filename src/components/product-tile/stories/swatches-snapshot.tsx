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
import { composeStories } from '@storybook/react-vite';

import * as SwatchesStories from './swatches.stories';
import { expect, test, describe, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ConfigWrapper, mockSiteObject } from '@/test-utils/config';

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return {
        ...actual,
        useNavigate: () => vi.fn(),
        useLocation: () => ({ pathname: '/', search: '', hash: '', state: null, key: 'test' }),
        useResolvedPath: () => ({ pathname: '/', search: '', hash: '' }),
        useHref: () => '/',
        Link: (props: any) => <a href={props.to} {...props}>{props.children}</a>,
        NavLink: (props: any) => <a href={props.to} {...props}>{props.children}</a>,
    };
});
vi.mock('@salesforce/storefront-next-runtime/site-context', async (importOriginal) => {
    const actual = await importOriginal<object>();
    return {
        ...actual,
        useSite: vi.fn(() => ({
            site: {
                id: mockSiteObject.id,
                defaultLocale: mockSiteObject.defaultLocale,
                defaultCurrency: mockSiteObject.defaultCurrency,
                supportedLocales: [
                    { id: mockSiteObject.defaultLocale, preferredCurrency: mockSiteObject.defaultCurrency },
                ],
                supportedCurrencies: mockSiteObject.supportedCurrencies,
            },
            language: mockSiteObject.defaultLocale,
            currency: mockSiteObject.defaultCurrency,
        })),
    };
});

const composed = composeStories(SwatchesStories);

afterEach(() => {
    cleanup();
});

describe('Swatches stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
        test(`${storyName} story renders and matches snapshot`, () => {
            const { container } = render(<Story />, { wrapper: ConfigWrapper });
            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
