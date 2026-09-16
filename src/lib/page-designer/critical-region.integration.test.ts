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
import type { ShopperExperience } from '@/scapi';
import { registry } from './registry';
import { prepareCriticalRegion } from './critical-region';

vi.mock('react-dom', () => ({ preloadModule: vi.fn(), preinit: vi.fn() }));
vi.mock('virtual:storefront-next/page-designer-preload-manifest', () => ({
    default: {
        resources: [],
        components: {},
    },
}));

describe('critical Page Designer registration integration', () => {
    beforeEach(() => registry.clear());
    afterEach(() => registry.clear());

    it('surfaces a rejected preparation once and lets a later request retry', async () => {
        const failure = new Error('critical component import failed');
        const importer = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce({ default: vi.fn() });
        registry.registerImporter('Content.criticalFailure', importer);
        const region = {
            id: 'critical',
            components: [{ id: 'critical-failure', typeId: 'Content.criticalFailure' }],
        } as ShopperExperience.schemas['Region'];

        let initialPreparation: unknown;
        try {
            prepareCriticalRegion(region);
        } catch (thrown) {
            initialPreparation = thrown;
        }
        expect(initialPreparation).toBeInstanceOf(Promise);
        await expect(initialPreparation).rejects.toBe(failure);

        expect(() => prepareCriticalRegion(region)).toThrow(failure);

        let retry: unknown;
        try {
            prepareCriticalRegion(region);
        } catch (thrown) {
            retry = thrown;
        }
        expect(retry).toBeInstanceOf(Promise);
        await expect(retry).resolves.toBeUndefined();
        expect(prepareCriticalRegion(region)).toBeUndefined();
        expect(importer).toHaveBeenCalledTimes(2);
    });
});
