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
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useRequireAuth } from './use-require-auth';

const mockNavigate = vi.fn();
const mockAddToast = vi.fn();

vi.mock('@/hooks/use-navigate', () => ({
    useNavigate: () => mockNavigate,
}));

vi.mock('@/providers/auth', () => ({
    useAuth: () => ({ userType: 'guest' }),
}));

vi.mock('@/components/toast', () => ({
    useToast: () => ({ addToast: mockAddToast }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

describe('useRequireAuth', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.history.replaceState({}, '', '/shop/global/en-US/p/123');
    });

    it('keeps the MRT base path out of the default authentication return URL', async () => {
        const wrapper = ({ children }: { children: ReactNode }) => (
            <MemoryRouter basename="/shop" initialEntries={['/shop/global/en-US/p/123']}>
                {children}
            </MemoryRouter>
        );
        const { result } = renderHook(
            () => useRequireAuth(vi.fn().mockResolvedValue(undefined), { actionName: 'writeReview' }),
            { wrapper }
        );

        await expect(result.current()).rejects.toThrow('Authentication required');

        const toastOptions = mockAddToast.mock.calls[0]?.[2];
        await act(() => toastOptions.action.onClick());

        const loginUrl = new URL(mockNavigate.mock.calls[0][0], window.location.origin);
        expect(loginUrl.searchParams.get('returnUrl')).toBe('/global/en-US/p/123?action=writeReview');
    });
});
