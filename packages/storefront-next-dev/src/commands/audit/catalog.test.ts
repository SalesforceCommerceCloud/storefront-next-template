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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Catalog from './catalog';
import { defaultCategoriesDir, discoverCatalog } from '../../audit/catalog';

vi.mock('../../audit/catalog', () => ({
    defaultCategoriesDir: vi.fn(() => '/bundled/categories'),
    discoverCatalog: vi.fn(() => Promise.resolve({ categories: [{ id: 'seo' }] })),
}));

/** Stands in for the command's `log`. */
const log = vi.fn();

function command(flags: Record<string, unknown>): Catalog {
    const cmd = new Catalog([], {} as never);
    vi.spyOn(cmd as any, 'parse').mockResolvedValue({ flags, args: {}, argv: [], raw: [], metadata: {} });
    vi.spyOn(cmd, 'log').mockImplementation(log);
    return cmd;
}

describe('audit catalog command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('prints the bundled catalog as JSON', async () => {
        const cmd = command({ 'project-directory': '/project' });

        await cmd.run();

        expect(defaultCategoriesDir).toHaveBeenCalled();
        expect(discoverCatalog).toHaveBeenCalledWith('/bundled/categories');
        expect(log).toHaveBeenCalledWith(JSON.stringify({ categories: [{ id: 'seo' }] }, null, 2));
    });

    it('reads --categories instead of the bundled directory', async () => {
        const cmd = command({ 'project-directory': '/project', categories: '/other/categories' });

        await cmd.run();

        expect(discoverCatalog).toHaveBeenCalledWith('/other/categories');
        expect(defaultCategoriesDir).not.toHaveBeenCalled();
    });

    it('is hidden', () => {
        expect(Catalog.hidden).toBe(true);
    });
});
