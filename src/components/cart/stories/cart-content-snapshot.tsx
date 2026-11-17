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
import type { AnchorHTMLAttributes, ReactNode, FormHTMLAttributes } from 'react';

const fetcherMock = {
    data: null as unknown,
    state: 'idle' as const,
    submit: vi.fn(),
    Form: (props: FormHTMLAttributes<HTMLFormElement> & { children?: ReactNode }) => (
        <form {...props}>{props.children}</form>
    ),
};

type LinkProps =
    | (AnchorHTMLAttributes<HTMLAnchorElement> & {
          to?: string;
          href?: string;
          children?: ReactNode;
      })
    | null;

vi.mock('react-router', async () => ({
    UNSAFE_DataRouterContext: (await import('react')).createContext({}),
    href: (path: string) => path,
    createContext: vi.fn().mockImplementation(() => ({})),
    createCookie: vi.fn().mockImplementation((name) => ({ name, parse: vi.fn(), serialize: vi.fn() })),
    useFetcher: () => fetcherMock,
    useFetchers: () => [],
    useNavigate: () => vi.fn(),
    useLocation: () => ({ pathname: '/', search: '', hash: '', state: null, key: 'test' }),
    useNavigation: () => ({
        state: 'idle',
        location: { pathname: '/', search: '', hash: '', state: null, key: 'test' },
    }),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    Link: (props: LinkProps) => {
        const { to, href, children, ...rest } = (props ?? {}) as AnchorHTMLAttributes<HTMLAnchorElement> & {
            to?: string;
            href?: string;
            children?: ReactNode;
        };
        return (
            <a href={to ?? href} {...rest}>
                {children}
            </a>
        );
    },
}));
vi.mock('@/components/toast', () => ({
    useToast: () => ({ addToast: vi.fn() }),
}));

import { composeStories } from '@storybook/react-vite';

import * as CartStories from './cart-content.stories';
import { render, cleanup } from '@testing-library/react';
import { AllProvidersWrapper } from '@/test-utils/context-provider';

const composed = composeStories(CartStories);

afterEach(() => {
    cleanup();
});

describe('CartContent stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
        if (Story?.parameters?.snapshot === false || /interactiontests?/i.test(storyName)) continue;
        test(`${storyName} story renders and matches snapshot`, () => {
            const { container } = render(
                <AllProvidersWrapper>
                    <Story />
                </AllProvidersWrapper>
            );
            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
