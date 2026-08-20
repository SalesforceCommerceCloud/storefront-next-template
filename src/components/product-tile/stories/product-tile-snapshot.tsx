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
import * as ProductTileStories from './product-tile.stories';
import { render, cleanup, waitFor } from '@testing-library/react';

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return {
        ...actual,
        useNavigate: () => vi.fn(),
        useLocation: () => ({ pathname: '/', search: '', hash: '', state: null, key: 'test' }),
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
            Form: (props: any) => <form {...props} />,
            formMethod: undefined,
            formAction: undefined,
            formData: undefined,
            formEncType: undefined,
            json: undefined,
            text: undefined,
        }),
        Link: (props: any) => (
            <a href={props.to} {...props}>
                {props.children}
            </a>
        ),
        NavLink: (props: any) => (
            <a href={props.to} {...props}>
                {props.children}
            </a>
        ),
    };
});

const composed = composeStories(ProductTileStories);

afterEach(() => {
    cleanup();
});

describe('ProductTile stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
        // Interaction-only stories opt out of snapshotting. The design-mode empty state renders
        // inside a lazy Suspense provider that resolves in a live browser but suspends to a fallback
        // in this synchronous render — so its DOM is not deterministically snapshottable.
        if (Story?.parameters?.snapshot === false) continue;
        test(`${storyName} story renders and matches snapshot`, async () => {
            const { container } = render(<Story />);
            // Wait for lazy-loaded swatches to resolve through <Suspense/>
            await waitFor(() => {
                expect(container.querySelector('[data-slot="skeleton"]')).toBeNull();
            });
            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
