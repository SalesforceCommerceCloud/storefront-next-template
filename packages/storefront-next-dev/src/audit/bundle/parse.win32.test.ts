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
import { describe, expect, it, vi } from 'vitest';

// Vite writes module ids with `/` on every platform; on Windows they must resolve to the same native paths as the
// source maps' sources, or no module would match between the two.
vi.mock('node:path', async () => {
    const actual = await vi.importActual<typeof import('node:path')>('node:path');
    return { ...actual.win32, default: actual.win32 };
});

const { lexerReady, moduleIdResolver, parseChunk } = await import('./parse');

describe('module ids on Windows', () => {
    const projectRoot = 'C:\\shop';
    const resolveId = moduleIdResolver(projectRoot, new Set(['src', 'node_modules']));

    it('resolves visualizer ids to native paths', () => {
        expect(resolveId('/src/root.tsx')).toBe('C:\\shop\\src\\root.tsx');
        expect(resolveId('C:/shop/node_modules/react/index.js?commonjs-es-import')).toBe(
            'C:\\shop\\node_modules\\react\\index.js'
        );
        expect(resolveId('\0C:/repo/node_modules/clsx/dist/clsx.mjs')).toBe(
            'C:\\repo\\node_modules\\clsx\\dist\\clsx.mjs'
        );
    });

    it('resolves source map sources to the same paths', async () => {
        await lexerReady;
        const map = JSON.stringify({
            version: 3,
            sources: ['../../../src/root.tsx'],
            names: [],
            mappings: 'AAAA',
        });
        const chunk = parseChunk('root.js', 'export{};', map, 'C:\\shop\\build\\client\\assets');
        expect([...chunk.modules.keys()]).toEqual([resolveId('/src/root.tsx')]);
    });
});
