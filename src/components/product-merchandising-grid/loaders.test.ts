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
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fetchMerchandisingGridProducts, loader } from './loaders';
import { fetchSearchProducts } from '@/lib/api/search.server';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';

vi.mock('@/lib/api/search.server', () => ({
    fetchSearchProducts: vi.fn(() => Promise.resolve({ hits: [] })),
}));

const context = {
    get: vi.fn(() => ({ currency: 'GBP' })),
};

describe('product merchandising grid loader', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(context.get).mockReturnValue({ currency: 'GBP' });
    });

    test('derives a bounded category search from the configured layout', async () => {
        await fetchMerchandisingGridProducts(context as never, {
            categoryId: 'living-room',
            columns: 4,
            rows: 999,
            currency: 'GBP',
        });

        expect(fetchSearchProducts).toHaveBeenCalledWith(context, {
            refine: ['cgid=living-room'],
            limit: 24,
            currency: 'GBP',
        });
    });

    test('does not search when Page Designer has no category configured', async () => {
        await expect(
            loader({
                componentData: { data: {} },
                context: context as never,
            })
        ).resolves.toBeNull();

        expect(fetchSearchProducts).not.toHaveBeenCalled();
    });

    test('uses the active site currency for Page Designer content', async () => {
        await loader({
            componentData: { data: { categoryId: 'bedroom', columns: '3', rows: 2 } },
            context: context as never,
        });

        expect(context.get).toHaveBeenCalledWith(siteContext);
        expect(fetchSearchProducts).toHaveBeenCalledWith(context, {
            refine: ['cgid=bedroom'],
            limit: 6,
            currency: 'GBP',
        });
    });
});
