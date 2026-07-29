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
import { composeStories } from '@storybook/react-vite';
import * as Stories from './wishlist-list-item.stories';
import { render, cleanup } from '@testing-library/react';

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return {
        ...actual,
        useNavigate: () => vi.fn(),
        useLocation: () => ({ pathname: '/', search: '', hash: '', state: null, key: 'test' }),
        useResolvedPath: () => ({ pathname: '/', search: '', hash: '' }),
        useHref: () => '/',
        useFetcher: () => ({
            state: 'idle',
            data: null,
            submit: vi.fn(),
            load: vi.fn(),
            Form: ({ children, ...props }: React.FormHTMLAttributes<HTMLFormElement> & { children: React.ReactNode }) => (
                <form {...props}>{children}</form>
            ),
        }),
        Link: (props: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; children: React.ReactNode }) => (
            <a href={props.to} {...props}>
                {props.children}
            </a>
        ),
        NavLink: (props: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; children: React.ReactNode }) => (
            <a href={props.to} {...props}>
                {props.children}
            </a>
        ),
    };
});

const composed = composeStories(Stories);

afterEach(() => {
    cleanup();
});

describe('WishlistListItem stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
        test(`${storyName} renders and matches snapshot`, () => {
            const { container } = render(<Story />);
            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
