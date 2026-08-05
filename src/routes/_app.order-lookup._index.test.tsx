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

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, type RouterContextProvider } from 'react-router';
import { loader, default as OrderLookupEntryPage } from './_app.order-lookup._index';

vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    getConfig: vi.fn(),
}));

vi.mock('@/middlewares/auth.server', () => ({
    getAuth: vi.fn(),
}));

vi.mock('@/lib/url.server', () => ({
    buildUrlFromContext: vi.fn((path: string) => path),
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    })),
}));

vi.mock('@/hooks/use-navigate', () => ({
    useNavigate: vi.fn(),
}));

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return {
        ...actual,
        useLocation: vi.fn(() => ({ key: 'default', pathname: '/order-lookup', search: '', hash: '', state: null })),
    };
});

vi.mock('@/components/order-lookup/request-code-form', () => ({
    RequestCodeForm: ({
        initialOrderNumber,
        initialEmail,
        onCodeSent,
    }: {
        initialOrderNumber?: string;
        initialEmail?: string;
        onCodeSent?: (params: { email: string; orderNumber: string }) => void;
    }) => (
        <div data-testid="request-code-form">
            <span data-testid="initial-order">{initialOrderNumber}</span>
            <span data-testid="initial-email">{initialEmail}</span>
            <button type="button" onClick={() => onCodeSent?.({ email: 'test@example.com', orderNumber: '12345' })}>
                Mock Code Sent
            </button>
        </div>
    ),
}));

vi.mock('@/components/seo-meta', () => ({
    SeoMeta: ({ title, description, noIndex }: { title: string; description: string; noIndex: boolean }) => (
        <div data-testid="seo-meta" data-title={title} data-description={description} data-no-index={noIndex} />
    ),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, params?: Record<string, unknown>) => {
            const translations: Record<string, string> = {
                'guestOrderLookup.title': 'Order Lookup',
                'guestOrderLookup.description': 'Enter the order number and email used at checkout.',
            };
            return params?.defaultValue || translations[key] || key;
        },
    }),
}));

import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getAuth } from '@/middlewares/auth.server';
import { buildUrlFromContext } from '@/lib/url.server';
import { useNavigate } from '@/hooks/use-navigate';

type LoaderArgs = Parameters<typeof loader>[0];

function callLoader(args: { request: Request; context: RouterContextProvider }) {
    return loader({ request: args.request, context: args.context } as unknown as LoaderArgs);
}

describe('_app.order-lookup._index loader', () => {
    let mockContext: RouterContextProvider;
    let mockRequest: Request;

    beforeEach(() => {
        mockContext = {} as RouterContextProvider;
        mockRequest = new Request('http://localhost:3000/order-lookup');
        vi.clearAllMocks();
    });

    it('returns 404 when feature is disabled', () => {
        (getConfig as Mock).mockReturnValue({
            guestOrderLookup: { enabled: false },
        });
        (getAuth as Mock).mockReturnValue({
            customerId: null,
            userType: 'guest',
        });

        try {
            callLoader({ context: mockContext, request: mockRequest });
            expect.fail('Expected loader to throw 404');
        } catch (error) {
            expect(error).toMatchObject({
                data: { message: 'Not found' },
                init: { status: 404 },
            });
        }
    });

    it('redirects registered customers to /account/orders', () => {
        (getConfig as Mock).mockReturnValue({
            guestOrderLookup: { enabled: true },
        });
        (getAuth as Mock).mockReturnValue({
            customerId: 'c123',
            userType: 'registered',
        });
        (buildUrlFromContext as Mock).mockReturnValue('/account/orders');

        try {
            callLoader({ context: mockContext, request: mockRequest });
            expect.fail('Expected loader to throw redirect');
        } catch (error) {
            expect(error).toBeInstanceOf(Response);
            expect((error as Response).status).toBe(302);
            expect((error as Response).headers.get('Location')).toBe('/account/orders');
        }
    });

    it('returns empty response for guest users', () => {
        (getConfig as Mock).mockReturnValue({
            guestOrderLookup: { enabled: true },
        });
        (getAuth as Mock).mockReturnValue({
            customerId: null,
            userType: 'guest',
        });

        const response = callLoader({ context: mockContext, request: mockRequest });
        expect(response).toBeInstanceOf(Response);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    });

    it('returns empty response for guest customers with customerId', () => {
        (getConfig as Mock).mockReturnValue({
            guestOrderLookup: { enabled: true },
        });
        (getAuth as Mock).mockReturnValue({
            customerId: 'guest123',
            userType: 'guest',
        });

        const response = callLoader({ context: mockContext, request: mockRequest });
        expect(response).toBeInstanceOf(Response);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    });
});

describe('OrderLookupEntryPage component', () => {
    let mockNavigate: Mock;

    beforeEach(() => {
        mockNavigate = vi.fn();
        (useNavigate as Mock).mockReturnValue(mockNavigate);
    });

    function renderPage(search = '') {
        return render(
            <MemoryRouter initialEntries={[`/order-lookup${search}`]}>
                <OrderLookupEntryPage />
            </MemoryRouter>
        );
    }

    it('renders heading and form', () => {
        renderPage();

        expect(screen.getByRole('heading', { name: 'Order Lookup' })).toBeInTheDocument();
        expect(screen.getByTestId('request-code-form')).toBeInTheDocument();
    });

    it('renders SEO meta with noindex', () => {
        renderPage();

        const seoMeta = screen.getByTestId('seo-meta');
        expect(seoMeta).toHaveAttribute('data-title', 'Order Lookup');
        expect(seoMeta).toHaveAttribute('data-description', 'Enter the order number and email used at checkout.');
        expect(seoMeta).toHaveAttribute('data-no-index', 'true');
    });

    it('passes initial values from URL params to RequestCodeForm', () => {
        renderPage('?order=12345&email=test@example.com');

        expect(screen.getByTestId('initial-order')).toHaveTextContent('12345');
        expect(screen.getByTestId('initial-email')).toHaveTextContent('test@example.com');
    });

    it('navigates to results page with URL-encoded params on code sent', () => {
        renderPage();

        const mockCodeSentButton = screen.getByRole('button', { name: 'Mock Code Sent' });
        mockCodeSentButton.click();

        expect(mockNavigate).toHaveBeenCalledWith('/order-lookup/results?order=12345&email=test%40example.com');
    });

    it('replaces RequestCodeForm with a spinner immediately on code sent, before navigation resolves', () => {
        renderPage();

        const mockCodeSentButton = screen.getByRole('button', { name: 'Mock Code Sent' });
        act(() => {
            mockCodeSentButton.click();
        });

        expect(screen.queryByTestId('request-code-form')).not.toBeInTheDocument();
    });

    it('handles empty initial values', () => {
        renderPage();

        expect(screen.getByTestId('initial-order')).toHaveTextContent('');
        expect(screen.getByTestId('initial-email')).toHaveTextContent('');
    });
});
