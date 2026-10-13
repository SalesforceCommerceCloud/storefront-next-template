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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiClients } from '@/lib/api-clients.server';
import { createTestContext } from '@/lib/test-utils';
import { fetchContent } from './content.server';

const getContent = vi.fn();

vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: vi.fn(() => ({ shopperExperience: { getContent } })),
}));

describe('fetchContent', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns the content asset fetched by ID', async () => {
        const context = createTestContext();
        const content = { id: 'about', name: 'About us', c_body: '<p>Our story</p>' };
        getContent.mockResolvedValue({ data: content });

        await expect(fetchContent(context, 'about')).resolves.toBe(content);
        expect(createApiClients).toHaveBeenCalledWith(context);
        expect(getContent).toHaveBeenCalledWith({ params: { path: { id: 'about' } } });
    });

    it('preserves SCAPI errors for the route to classify', async () => {
        const failure = new Error('SCAPI unavailable');
        getContent.mockRejectedValue(failure);

        await expect(fetchContent(createTestContext(), 'about')).rejects.toBe(failure);
    });
});
