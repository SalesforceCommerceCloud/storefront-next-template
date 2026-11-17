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
import { render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BasketHandoffWarning } from './basket-handoff-warning';
const addToast = vi.hoisted(() => vi.fn());
vi.mock('@/components/toast', () => ({ useToast: () => ({ addToast }) }));
vi.mock('@salesforce/storefront-next-runtime/site-context', () => ({ useSite: () => ({ site: { id: 'test' } }) }));
vi.mock('@salesforce/storefront-next-runtime/config', () => ({ useConfig: () => ({}) }));
vi.mock('react-router', () => ({ useLocation: () => ({ key: 'test' }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: () => 'Review your cart before checking out.' }) }));
afterEach(() => {
    document.cookie = 'basket-handoff_test=; Max-Age=0; Path=/';
});
beforeEach(() => vi.clearAllMocks());
it('contains no notification without a handoff warning', () => {
    render(<BasketHandoffWarning />);
    expect(addToast).not.toHaveBeenCalled();
});
it('announces uncertainty and consumes the notification cookie', () => {
    document.cookie = 'basket-handoff_test=1; Path=/';
    render(<BasketHandoffWarning />);
    expect(addToast).toHaveBeenCalledExactlyOnceWith('Review your cart before checking out.', 'info');
    expect(document.cookie).not.toContain('basket-handoff_test');
});
