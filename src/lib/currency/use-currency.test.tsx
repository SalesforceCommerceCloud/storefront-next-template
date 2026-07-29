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

import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { useCurrency } from './use-currency';

const SUPPORTED = ['USD', 'GBP', 'EUR'];
// React Router createCookie('currency').serialize('GBP') → IkdCUCI%3D
const COOKIE_GBP = 'currency=IkdCUCI%3D';

function Harness() {
    const currency = useCurrency('USD', SUPPORTED, 'currency');
    return (
        <output data-testid="currency" aria-label="Current currency">
            {currency}
        </output>
    );
}

afterEach(() => {
    // Reset document.cookie between cases (jsdom).
    document.cookie = 'currency=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
});

describe('useCurrency', () => {
    it('returns the loader currency when no cookie is present', () => {
        const { result } = renderHook(() => useCurrency('USD', SUPPORTED, 'currency'));
        expect(result.current).toBe('USD');
    });

    it('restores a supported currency from the cookie', () => {
        document.cookie = COOKIE_GBP;
        const { result } = renderHook(() => useCurrency('USD', SUPPORTED, 'currency'));
        expect(result.current).toBe('GBP');
    });

    it('ignores an unsupported cookie value and keeps the loader currency', () => {
        document.cookie = 'currency=IlhYWCI%3D'; // "XXX"
        const { result } = renderHook(() => useCurrency('USD', SUPPORTED, 'currency'));
        expect(result.current).toBe('USD');
    });

    it('keeps the loader currency when the cookie name is empty (no cookie to read)', () => {
        // A best-effort restore must never crash the app shell when the configured cookie name
        // is missing — it falls back to the loader value instead of running an empty-name regex.
        document.cookie = COOKIE_GBP;
        const { result } = renderHook(() => useCurrency('USD', SUPPORTED, ''));
        expect(result.current).toBe('USD');
    });

    it('re-parses when only the cookie name changes (cache keyed on name too)', () => {
        // Two cookies present; document.cookie is identical across both renders, so a
        // header-only cache would return the first name's value for the second name.
        document.cookie = COOKIE_GBP; // currency=…GBP
        document.cookie = 'altCurrency=IkVVUiI%3D'; // altCurrency=…EUR
        const { result, rerender } = renderHook(({ name }: { name: string }) => useCurrency('USD', SUPPORTED, name), {
            initialProps: { name: 'currency' },
        });
        expect(result.current).toBe('GBP');

        rerender({ name: 'altCurrency' });
        expect(result.current).toBe('EUR');

        document.cookie = 'altCurrency=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    });

    // The load-bearing property: SSR emits the neutral loader value (matching a cached shell),
    // then the client corrects to the cookie value after hydration WITHOUT a hydration-mismatch
    // warning. getServerSnapshot → null is what makes the first client commit match the SSR HTML;
    // a useState/useEffect implementation would render GBP on the first commit and mismatch.
    it('hydrates the cached shell and corrects to the cookie without a hydration warning', () => {
        // SSR renders with the cookie unreadable server-side → getServerSnapshot → loader currency.
        const serverHtml = renderToString(<Harness />);
        expect(serverHtml).toContain('USD');

        // The shopper's selected currency is present in the browser cookie on the cached shell.
        document.cookie = COOKIE_GBP;

        const container = document.createElement('div');
        container.innerHTML = serverHtml;
        document.body.appendChild(container);

        // React 19 surfaces hydration text mismatches via console.error AND onRecoverableError.
        const recoverableErrors: string[] = [];
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            let root: ReturnType<typeof hydrateRoot>;
            act(() => {
                root = hydrateRoot(container, <Harness />, {
                    onRecoverableError: (error) => recoverableErrors.push(String(error)),
                });
            });

            // First commit matched the SSR HTML (no mismatch), then the cookie corrected the value.
            expect(container.querySelector('[data-testid="currency"]')?.textContent).toBe('GBP');
            const complaints = [...errorSpy.mock.calls.map((call) => String(call[0])), ...recoverableErrors];
            expect(complaints.filter((message) => /hydrat/i.test(message))).toEqual([]);

            act(() => root.unmount());
        } finally {
            errorSpy.mockRestore();
            document.body.removeChild(container);
        }
    });
});
