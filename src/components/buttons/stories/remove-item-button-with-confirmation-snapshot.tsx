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
import { vi, expect, test, describe, afterEach } from 'vitest';

type MockFormProps = React.PropsWithChildren<Record<string, unknown>>;
type MockLinkProps = React.PropsWithChildren<{ to?: string; href?: string; [key: string]: unknown }>;

const fetcherMock = {
    data: null,
    state: 'idle',

    submit: () => {},
    Form: (props: MockFormProps) => <form {...props}>{props.children}</form>,
};

vi.mock('react-router', () => ({
    href: (path: string) => path,
    createCookie: (name: string) => ({
        name,
        parse: () => null,
        serialize: () => '',
    }),
    createContext: vi.fn().mockImplementation(() => ({})),
    useFetcher: () => fetcherMock,
    useFormAction: () => '.',
    useFetchers: () => [],

    useNavigate: () => () => {},
    useLocation: () => ({ pathname: '/', search: '', hash: '', state: null, key: 'test' }),
    useNavigation: () => ({
        state: 'idle',
        location: { pathname: '/', search: '', hash: '', state: null, key: 'test' },
    }),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    // Add missing Form component
    Form: (props: MockFormProps) => <form {...props}>{props.children}</form>,
    // Add missing createMemoryRouter
    createMemoryRouter: vi.fn().mockImplementation(() => ({
        navigate: vi.fn(),
        state: { location: { pathname: '/', search: '', hash: '', state: null } },
    })),
    // Add missing RouterProvider
    RouterProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Link: (props: MockLinkProps) => {
        const { to, href, children, ...rest } = props ?? {};
        return (
            <a href={to ?? href} {...rest}>
                {children}
            </a>
        );
    },
}));
vi.mock('@/components/toast', () => ({
    useToast: () => ({
        addToast: () => {},
    }),
}));

import { composeStories } from '@storybook/react-vite';

import * as RemoveItemButtonWithConfirmationStories from './remove-item-button-with-confirmation.stories';
import { render, cleanup } from '@testing-library/react';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig } from '@/test-utils/config';

const composed = composeStories(RemoveItemButtonWithConfirmationStories);

afterEach(() => {
    cleanup();
});

describe('RemoveItemButtonWithConfirmation stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
        test(`${storyName} story renders and matches snapshot`, () => {
            const { container } = render(
                <ConfigProvider config={mockConfig}>
                    <Story />
                </ConfigProvider>
            );
            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
