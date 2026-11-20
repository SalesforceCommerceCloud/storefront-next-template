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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScapiFetcher } from './use-scapi-fetcher';

// @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
import { createElement, type PropsWithChildren } from 'react';
import { StoreLocatorContext } from '@/extensions/store-locator/providers/context';
import { createStoreLocatorStore } from '@/extensions/store-locator/stores/store-locator-store';
import { useScapiFetcherEffect } from './use-scapi-fetcher-effect';
// @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

// Mock React Router's useFetcher
const mockFetcher = {
    state: 'idle' as 'idle' | 'loading' | 'submitting',
    data: null as any,
    load: vi.fn(),
    submit: vi.fn(),
    success: false,
    errors: undefined,
};

vi.mock('react-router', () => ({
    href: (path: string) => path,
    useFetcher: vi.fn(() => mockFetcher),
}));

// Mock dependencies
vi.mock('@/lib/url', () => ({
    encodeBase64Url: vi.fn((str) => btoa(str)),
}));

// Mock the fetcher registry so we can assert the registration lifecycle. `createFetcherRegistration(key)` returns a
// handle whose `register(...)` records the fetcher's `load` lazily and whose `unregister` tears the entry down.
const mockRegister = vi.fn();
const mockUnregister = vi.fn();
const mockCreateFetcherRegistration = vi.fn((_key: string) => ({
    register: mockRegister,
    unregister: mockUnregister,
}));
vi.mock('@/lib/scapi/fetcher-registry', () => ({
    createFetcherRegistration: (key: string) => mockCreateFetcherRegistration(key),
}));

describe('useScapiFetcher', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFetcher.state = 'idle';
        mockFetcher.data = null;
        // Configure mocks to return promises
        mockFetcher.load.mockReturnValue(Promise.resolve());
        mockFetcher.submit.mockReturnValue(Promise.resolve());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('load method', () => {
        it('should call fetcher.load with correct resource URL', () => {
            const { result } = renderHook(() =>
                useScapiFetcher('shopperCustomers', 'getCustomer', {
                    params: {
                        path: { organizationId: 'org-123', customerId: 'test' },
                        query: { siteId: 'site-123' },
                    },
                })
            );

            act(() => {
                void result.current.load();
            });

            expect(mockFetcher.load).toHaveBeenCalled();
            const callArg = mockFetcher.load.mock.calls[0][0];
            expect(callArg).toEqual(
                '/resource/api/client/WyJzaG9wcGVyQ3VzdG9tZXJzIiwiZ2V0Q3VzdG9tZXIiLHsicGFyYW1zIjp7InBhdGgiOnsib3JnYW5pemF0aW9uSWQiOiJvcmctMTIzIiwiY3VzdG9tZXJJZCI6InRlc3QifSwicXVlcnkiOnsic2l0ZUlkIjoic2l0ZS0xMjMifX19XQ=='
            );
        });

        it('should call fetcher.load and return a promise', () => {
            const { result } = renderHook(() =>
                useScapiFetcher('shopperCustomers', 'getCustomer', {
                    params: {
                        path: { organizationId: 'org-123', customerId: 'test' },
                        query: { siteId: 'site-123' },
                    },
                })
            );

            const returnValue = result.current.load();
            expect(returnValue).toBeInstanceOf(Promise);
        });

        it('should handle timeout configuration', () => {
            const { result } = renderHook(() =>
                useScapiFetcher('shopperCustomers', 'getCustomer', {
                    params: {
                        path: { organizationId: 'org-123', customerId: 'test' },
                        query: { siteId: 'site-123' },
                    },
                })
            );

            act(() => {
                void result.current.load();
            });

            expect(mockFetcher.load).toHaveBeenCalled();
            const callArg = mockFetcher.load.mock.calls[0][0];
            expect(callArg).toEqual(
                '/resource/api/client/WyJzaG9wcGVyQ3VzdG9tZXJzIiwiZ2V0Q3VzdG9tZXIiLHsicGFyYW1zIjp7InBhdGgiOnsib3JnYW5pemF0aW9uSWQiOiJvcmctMTIzIiwiY3VzdG9tZXJJZCI6InRlc3QifSwicXVlcnkiOnsic2l0ZUlkIjoic2l0ZS0xMjMifX19XQ=='
            );
        });
    });

    describe('submit method', () => {
        it('should call fetcher.submit with correct resource URL and POST method', () => {
            const { result } = renderHook(() =>
                useScapiFetcher('shopperCustomers', 'updateCustomer', {
                    params: {
                        path: { organizationId: 'org-123', customerId: 'test' },
                        query: { siteId: 'site-123' },
                    },
                    body: {},
                })
            );

            const submitData = { email: 'new@example.com' };

            act(() => {
                void result.current.submit(submitData);
            });

            expect(mockFetcher.submit).toHaveBeenCalledWith(submitData, {
                method: 'POST',
                action: '/resource/api/client/WyJzaG9wcGVyQ3VzdG9tZXJzIiwidXBkYXRlQ3VzdG9tZXIiLHsicGFyYW1zIjp7InBhdGgiOnsib3JnYW5pemF0aW9uSWQiOiJvcmctMTIzIiwiY3VzdG9tZXJJZCI6InRlc3QifSwicXVlcnkiOnsic2l0ZUlkIjoic2l0ZS0xMjMifX0sImJvZHkiOnt9fV0=',
                encType: 'application/json',
            });
        });

        it('should call fetcher.submit and return a promise', () => {
            const { result } = renderHook(() =>
                useScapiFetcher('shopperCustomers', 'updateCustomer', {
                    params: {
                        path: { organizationId: 'org-123', customerId: 'test' },
                        query: { siteId: 'site-123' },
                    },
                    body: {},
                })
            );

            const returnValue = result.current.submit({ email: 'new@example.com' });
            expect(returnValue).toBeInstanceOf(Promise);
        });

        it('should handle timeout configuration', () => {
            const { result } = renderHook(() =>
                useScapiFetcher('shopperCustomers', 'updateCustomer', {
                    params: {
                        path: { organizationId: 'org-123', customerId: 'test' },
                        query: { siteId: 'site-123' },
                    },
                    body: {},
                })
            );

            const submitData = { email: 'new@example.com' };

            act(() => {
                void result.current.submit(submitData);
            });

            expect(mockFetcher.submit).toHaveBeenCalledWith(submitData, {
                method: 'POST',
                action: '/resource/api/client/WyJzaG9wcGVyQ3VzdG9tZXJzIiwidXBkYXRlQ3VzdG9tZXIiLHsicGFyYW1zIjp7InBhdGgiOnsib3JnYW5pemF0aW9uSWQiOiJvcmctMTIzIiwiY3VzdG9tZXJJZCI6InRlc3QifSwicXVlcnkiOnsic2l0ZUlkIjoic2l0ZS0xMjMifX0sImJvZHkiOnt9fV0=',
                encType: 'application/json',
            });
        });

        it('should use empty object when no target is provided', () => {
            const { result } = renderHook(() =>
                useScapiFetcher('shopperCustomers', 'updateCustomer', {
                    params: {
                        path: { organizationId: 'org-123', customerId: 'test' },
                        query: { siteId: 'site-123' },
                    },
                    body: {},
                })
            );

            act(() => {
                void result.current.submit({});
            });

            expect(mockFetcher.submit).toHaveBeenCalledWith(
                {},
                {
                    method: 'POST',
                    action: '/resource/api/client/WyJzaG9wcGVyQ3VzdG9tZXJzIiwidXBkYXRlQ3VzdG9tZXIiLHsicGFyYW1zIjp7InBhdGgiOnsib3JnYW5pemF0aW9uSWQiOiJvcmctMTIzIiwiY3VzdG9tZXJJZCI6InRlc3QifSwicXVlcnkiOnsic2l0ZUlkIjoic2l0ZS0xMjMifX0sImJvZHkiOnt9fV0=',
                    encType: 'application/json',
                }
            );
        });

        it('should use empty object when target is null', () => {
            const { result } = renderHook(() =>
                useScapiFetcher('shopperCustomers', 'updateCustomer', {
                    params: {
                        path: { organizationId: 'org-123', customerId: 'test' },
                        query: { siteId: 'site-123' },
                    },
                    body: {},
                })
            );

            act(() => {
                void result.current.submit(null as any);
            });

            expect(mockFetcher.submit).toHaveBeenCalledWith(
                {},
                {
                    method: 'POST',
                    action: '/resource/api/client/WyJzaG9wcGVyQ3VzdG9tZXJzIiwidXBkYXRlQ3VzdG9tZXIiLHsicGFyYW1zIjp7InBhdGgiOnsib3JnYW5pemF0aW9uSWQiOiJvcmctMTIzIiwiY3VzdG9tZXJJZCI6InRlc3QifSwicXVlcnkiOnsic2l0ZUlkIjoic2l0ZS0xMjMifX0sImJvZHkiOnt9fV0=',
                    encType: 'application/json',
                }
            );
        });

        it('should use empty object when target is undefined', () => {
            const { result } = renderHook(() =>
                useScapiFetcher('shopperCustomers', 'updateCustomer', {
                    params: {
                        path: { organizationId: 'org-123', customerId: 'test' },
                        query: { siteId: 'site-123' },
                    },
                    body: {},
                })
            );

            act(() => {
                void result.current.submit(undefined as any);
            });

            expect(mockFetcher.submit).toHaveBeenCalledWith(
                {},
                {
                    method: 'POST',
                    action: '/resource/api/client/WyJzaG9wcGVyQ3VzdG9tZXJzIiwidXBkYXRlQ3VzdG9tZXIiLHsicGFyYW1zIjp7InBhdGgiOnsib3JnYW5pemF0aW9uSWQiOiJvcmctMTIzIiwiY3VzdG9tZXJJZCI6InRlc3QifSwicXVlcnkiOnsic2l0ZUlkIjoic2l0ZS0xMjMifX0sImJvZHkiOnt9fV0=',
                    encType: 'application/json',
                }
            );
        });

        it('should NOT auto-encode JSON when payload is FormData (passes through as form-urlencoded)', () => {
            const { result } = renderHook(() =>
                useScapiFetcher('shopperCustomers', 'updateCustomer', {
                    params: {
                        path: { organizationId: 'org-123', customerId: 'test' },
                        query: { siteId: 'site-123' },
                    },
                    body: {},
                })
            );

            const formData = new FormData();
            formData.append('email', 'new@example.com');

            act(() => {
                // FormData payload — submit() at runtime handles it via auto-detect, but the
                // hook's body generic types it as the SCAPI shape, so cast to bypass.
                void result.current.submit(formData as unknown as Record<string, unknown>);
            });

            // No encType on the call → react-router falls back to its default form encoding.
            const opts = mockFetcher.submit.mock.calls[0][1];
            expect(opts).not.toHaveProperty('encType');
        });

        it('should let callers override the auto-detected encType via opts', () => {
            const { result } = renderHook(() =>
                useScapiFetcher('shopperCustomers', 'updateCustomer', {
                    params: {
                        path: { organizationId: 'org-123', customerId: 'test' },
                        query: { siteId: 'site-123' },
                    },
                    body: {},
                })
            );

            act(() => {
                void result.current.submit({ email: 'new@example.com' }, { encType: 'multipart/form-data' });
            });

            const opts = mockFetcher.submit.mock.calls[0][1];
            expect(opts.encType).toBe('multipart/form-data');
        });
    });

    describe('state property', () => {
        it('should return fetcher state', () => {
            mockFetcher.state = 'loading';

            const { result } = renderHook(() =>
                useScapiFetcher('shopperCustomers', 'getCustomer', {
                    params: {
                        path: { organizationId: 'org-123', customerId: 'test' },
                        query: { siteId: 'site-123' },
                    },
                })
            );

            expect(result.current.state).toBe('loading');
        });
    });

    describe('data property', () => {
        it('should return fetcher data', () => {
            const mockData = { customerId: 'test', email: 'test@example.com' };
            mockFetcher.data = { success: true, data: mockData };
            mockFetcher.success = true;

            const { result } = renderHook(() =>
                useScapiFetcher('shopperCustomers', 'getCustomer', {
                    params: {
                        path: { organizationId: 'org-123', customerId: 'test' },
                        query: { siteId: 'site-123' },
                    },
                })
            );

            expect(result.current.data).toBe(mockData);
        });
    });

    describe('helpers overload', () => {
        it('should encode helper resource with correct format for load', () => {
            const { result } = renderHook(() =>
                useScapiFetcher('helpers', 'basket', 'getOrCreateBasket', {
                    params: { path: { basketId: 'basket-123' } },
                    body: { currency: 'USD' },
                })
            );

            act(() => {
                void result.current.load();
            });

            expect(mockFetcher.load).toHaveBeenCalled();
            const callArg = mockFetcher.load.mock.calls[0][0];
            // Verify it starts with the resource API route
            expect(callArg).toMatch(/^\/resource\/api\/client\//);
            // Decode the resource to verify the format
            const resourcePart = callArg.replace('/resource/api/client/', '');
            const decoded = JSON.parse(atob(resourcePart));
            expect(decoded[0]).toBe('helpers');
            expect(decoded[1]).toBe('basket');
            expect(decoded[2]).toEqual({
                helperName: 'getOrCreateBasket',
                params: { path: { basketId: 'basket-123' } },
                body: { currency: 'USD' },
            });
        });

        it('should encode helper resource without options', () => {
            const { result } = renderHook(() => useScapiFetcher('helpers', 'auth', 'loginAsGuest'));

            act(() => {
                void result.current.load();
            });

            expect(mockFetcher.load).toHaveBeenCalled();
            const callArg = mockFetcher.load.mock.calls[0][0];
            const resourcePart = callArg.replace('/resource/api/client/', '');
            const decoded = JSON.parse(atob(resourcePart));
            expect(decoded[0]).toBe('helpers');
            expect(decoded[1]).toBe('auth');
            expect(decoded[2]).toEqual({ helperName: 'loginAsGuest' });
        });

        it('should call fetcher.submit with correct action for helpers', () => {
            const { result } = renderHook(() =>
                useScapiFetcher('helpers', 'basket', 'getOrCreateBasket', {
                    params: { path: { basketId: 'basket-123' } },
                    body: { currency: 'USD' },
                })
            );

            const submitData = { currency: 'EUR' };
            act(() => {
                void result.current.submit(submitData);
            });

            expect(mockFetcher.submit).toHaveBeenCalled();
            const [payload, opts] = mockFetcher.submit.mock.calls[0];
            expect(payload).toEqual(submitData);
            expect(opts.method).toBe('POST');
            expect(opts.action).toMatch(/^\/resource\/api\/client\//);
        });

        it('should return data from fetcher response', () => {
            const mockData = { basketId: 'basket-123', currency: 'USD' };
            mockFetcher.data = { success: true, data: mockData };

            const { result } = renderHook(() =>
                useScapiFetcher('helpers', 'basket', 'getOrCreateBasket', {
                    params: { path: { basketId: 'basket-123' } },
                    body: { currency: 'USD' },
                })
            );

            expect(result.current.data).toBe(mockData);
            expect(result.current.success).toBe(true);
        });
    });

    describe('request cancellation', () => {
        it('should handle multiple concurrent requests', () => {
            const { result } = renderHook(() =>
                useScapiFetcher('shopperCustomers', 'getCustomer', {
                    params: {
                        path: { organizationId: 'org-123', customerId: 'test' },
                        query: { siteId: 'site-123' },
                    },
                })
            );

            act(() => {
                // Start first request
                void result.current.load();
                // Start second request immediately
                void result.current.load();
            });

            // Both should return promises
            expect(result.current.load()).toBeInstanceOf(Promise);
            expect(result.current.load()).toBeInstanceOf(Promise);
        });
    });

    describe('fetcher registry integration', () => {
        const customerResourceKey = btoa(
            JSON.stringify(['shopperCustomers', 'getCustomer', { params: { path: { customerId: 'test' } } }])
        );

        it('opens a registration handle keyed by the resource on mount', () => {
            renderHook(() =>
                useScapiFetcher('shopperCustomers', 'getCustomer', {
                    params: { path: { customerId: 'test' } },
                })
            );

            expect(mockCreateFetcherRegistration).toHaveBeenCalledTimes(1);
            // The registry key must equal the encoded resource (the useFetcher key).
            expect(mockCreateFetcherRegistration).toHaveBeenCalledWith(customerResourceKey);
        });

        it('does not record any invocation until load() is called', () => {
            renderHook(() =>
                useScapiFetcher('shopperCustomers', 'getCustomer', { params: { path: { customerId: 'test' } } })
            );

            // Opening the handle is lazy — a mounted-but-never-loaded fetcher records nothing.
            expect(mockRegister).not.toHaveBeenCalled();
        });

        it('records the load invocation against the resource URL when load() runs', () => {
            const { result } = renderHook(() =>
                useScapiFetcher('shopperCustomers', 'getCustomer', { params: { path: { customerId: 'test' } } })
            );

            act(() => {
                void result.current.load();
            });

            expect(mockRegister).toHaveBeenCalledTimes(1);
            const [method, href] = mockRegister.mock.calls[0];
            // The recorded method is the underlying react-router fetcher.load, replayed with the resource URL.
            expect(method).toBe(mockFetcher.load);
            expect(href).toBe(`/resource/api/client/${customerResourceKey}`);
        });

        it('never registers anything for submit() — a submit is a write and must not be replayable', () => {
            const { result } = renderHook(() =>
                useScapiFetcher('shopperCustomers', 'updateCustomer', {
                    params: { path: { organizationId: 'org-123', customerId: 'test' } },
                    body: {},
                })
            );

            act(() => {
                void result.current.submit({ email: 'new@example.com' });
            });

            // The mutation still fires, but it leaves no registry entry, so a later revalidation pass can never
            // re-issue it.
            expect(mockFetcher.submit).toHaveBeenCalledTimes(1);
            expect(mockRegister).not.toHaveBeenCalled();
        });

        it('unregisters on unmount', () => {
            const { unmount } = renderHook(() =>
                useScapiFetcher('shopperCustomers', 'getCustomer', { params: { path: { customerId: 'test' } } })
            );

            expect(mockUnregister).not.toHaveBeenCalled();
            unmount();
            expect(mockUnregister).toHaveBeenCalledTimes(1);
        });

        it('unregisters the prior handle and opens a fresh one when the resource changes', () => {
            const { rerender } = renderHook(
                ({ id }) =>
                    useScapiFetcher('shopperCustomers', 'getCustomer', {
                        params: { path: { customerId: id } },
                    }),
                { initialProps: { id: 'test' } }
            );

            expect(mockCreateFetcherRegistration).toHaveBeenCalledTimes(1);
            expect(mockUnregister).not.toHaveBeenCalled();

            // A new resource key yields a new handle; the effect cleanup tears the previous one down first.
            rerender({ id: 'other' });

            expect(mockUnregister).toHaveBeenCalledTimes(1);
            expect(mockCreateFetcherRegistration).toHaveBeenCalledTimes(2);
            expect(mockCreateFetcherRegistration).toHaveBeenLastCalledWith(
                btoa(JSON.stringify(['shopperCustomers', 'getCustomer', { params: { path: { customerId: 'other' } } }]))
            );
        });
    });
});

// @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
describe('store-qualified retained data', () => {
    it('hides retained priced results while reloading and publishes the next successful result', () => {
        mockFetcher.state = 'loading';
        mockFetcher.data = { success: true, data: { price: 10 } };
        const { result, rerender } = renderHook(() =>
            useScapiFetcher('shopperProducts', 'getProduct', {
                params: { path: { id: 'sku' }, query: { expand: ['prices'] } },
            })
        );
        expect(result.current.data).toBeUndefined();
        expect(result.current.success).toBe(true);
        expect(result.current.qualificationPending).toBe(true);
        mockFetcher.state = 'idle';
        mockFetcher.data = { success: true, data: { price: 20 } };
        rerender();
        expect(result.current.data).toEqual({ price: 20 });
        expect(result.current.success).toBe(true);
    });
    it('retains metadata-only data while it reloads', () => {
        mockFetcher.state = 'loading';
        mockFetcher.data = { success: true, data: { id: 'sku' } };
        const { result } = renderHook(() =>
            useScapiFetcher('shopperProducts', 'getProduct', {
                params: { path: { id: 'sku' }, query: { expand: ['images'] } },
            })
        );
        expect(result.current.data).toEqual({ id: 'sku' });
    });
});

describe('mutation completion while store qualification is unsettled', () => {
    it.each([
        'pending',
        'unknown',
    ])('delivers a customer update and its success callback during %s selection', (phase) => {
        const store = createStoreLocatorStore();
        store.setState({
            selectionPending: phase === 'pending',
            selectionError: phase === 'unknown' ? 'outcome_unknown' : null,
        });
        const wrapper = ({ children }: PropsWithChildren) =>
            createElement(StoreLocatorContext.Provider, { value: store }, children);
        const onSuccess = vi.fn();
        mockFetcher.state = 'submitting';
        mockFetcher.data = undefined;
        const { result, rerender } = renderHook(
            () => {
                const fetcher = useScapiFetcher('shopperCustomers', 'updateCustomer', {
                    params: { path: { customerId: 'customer' } },
                    body: {},
                });
                useScapiFetcherEffect(fetcher, { onSuccess });
                return fetcher;
            },
            { wrapper }
        );
        mockFetcher.state = 'idle';
        mockFetcher.data = { success: true, data: { customerId: 'customer', email: 'updated@example.test' } };
        rerender();
        expect(result.current.success).toBe(true);
        expect(result.current.data).toEqual(mockFetcher.data.data);
        expect(onSuccess).toHaveBeenCalledExactlyOnceWith(mockFetcher.data.data);
    });
});
// @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR
