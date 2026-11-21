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
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { AuthContext } from '@/providers/auth';
import { Form } from '@/components/form';
import { useAuthFetcher } from '@/hooks/use-auth-fetcher';

describe('rendered authentication context binding', () => {
    it.each([
        'navigating form',
        'fetcher form',
        'imperative submit',
    ])('preserves index-route actions and the submitted body for %s', async (kind) => {
        const action = vi.fn(async ({ request }: { request: Request }) => {
            expect(new URL(request.url).searchParams.has('index')).toBe(true);
            expect(new URL(request.url).searchParams.get('__authContext')).toBe('rendered-context');
            expect((await request.formData()).get('productId')).toBe('product-1');
            return { success: true };
        });
        function Entry() {
            const fetcher = useAuthFetcher();
            if (kind === 'imperative submit')
                return (
                    <button onClick={() => void fetcher.submit({ productId: 'product-1' }, { method: 'post' })}>
                        Submit
                    </button>
                );
            const Component = kind === 'fetcher form' ? fetcher.Form : Form;
            return (
                <Component method="post">
                    <input name="productId" defaultValue="product-1" />
                    <button>Submit</button>
                </Component>
            );
        }
        const router = createMemoryRouter(
            [
                {
                    path: '/account',
                    Component: () => (
                        <AuthContext value={{ authContextVersion: 'rendered-context' }}>
                            <Outlet />
                        </AuthContext>
                    ),
                    children: [{ index: true, Component: Entry, action }],
                },
            ],
            { initialEntries: ['/account?display=summary'] }
        );
        render(<RouterProvider router={router} />);
        fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
        await waitFor(() => expect(action).toHaveBeenCalledOnce());
        await waitFor(() => expect(router.state.navigation.state).toBe('idle'));
        expect(router.state.errors).toBeNull();
    });

    it('binds fetcher reads and explicit resource actions without changing JSON payloads', async () => {
        const load = vi.fn(({ request }: { request: Request }) => ({
            context: new URL(request.url).searchParams.get('__authContext'),
        }));
        const action = vi.fn(async ({ request }: { request: Request }) => {
            expect(new URL(request.url).searchParams.get('__authContext')).toBe('v1');
            expect(await request.json()).toEqual({ quantity: 2 });
            return { success: true };
        });
        function Entry() {
            const fetcher = useAuthFetcher();
            return (
                <>
                    <button onClick={() => void fetcher.load('/resource?filter=available')}>Load</button>
                    <button
                        onClick={() =>
                            void fetcher.submit(
                                { quantity: 2 },
                                { method: 'post', encType: 'application/json', action: '/resource' }
                            )
                        }>
                        Write
                    </button>
                    <output>{JSON.stringify(fetcher.data)}</output>
                </>
            );
        }
        const router = createMemoryRouter([
            {
                path: '/',
                Component: () => (
                    <AuthContext value={{ authContextVersion: 'v1' }}>
                        <Entry />
                    </AuthContext>
                ),
            },
            { path: '/resource', loader: load, action },
        ]);
        render(<RouterProvider router={router} />);
        fireEvent.click(screen.getByText('Load'));
        await screen.findByText('{"context":"v1"}');
        expect(load).toHaveBeenCalledOnce();
        act(() => {
            fireEvent.click(screen.getByText('Write'));
        });
        await waitFor(() => expect(action).toHaveBeenCalledOnce());
        expect(router.state.errors).toBeNull();
    });
});
