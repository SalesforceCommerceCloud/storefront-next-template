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
import { vol } from 'memfs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const testDir = dirname(fileURLToPath(import.meta.url));

// Use the real memfs for reads, but make writes observable and force the file to exist.
vi.mock('fs', async () => {
    const memfs = await import('memfs');
    return {
        ...memfs.fs,
        writeFileSync: vi.fn(),
        existsSync: vi.fn().mockReturnValue(true),
    };
});

import { writeFileSync } from 'fs';
import { updateRegistryFile, generateRegistryCode, type ComponentInfo } from './staticRegistry';

const mockWriteFileSync = vi.mocked(writeFileSync);

// A path inside the package (resolved from this test file, not the cwd). Biome runs as a real
// subprocess with `cwd` set to this file's directory — a real, existing dir in the repo tree —
// so it discovers the repo `biome.json` by walking up and actually formats the stdin content.
const REPO_REGISTRY_PATH = resolve(testDir, 'static-registry.format-fixture.ts');

// A path whose directory does NOT exist on disk, so Biome's subprocess fails to spawn (bad cwd)
// and the formatter falls back to writing the content unformatted. Placed under the OS temp root.
const NO_FORMAT_PATH = resolve(tmpdir(), 'sfnext-static-registry-no-format-dir', 'static-registry.ts');

const SCAFFOLD = `import { registry } from '@/lib/page-designer/registry';

// STATIC_REGISTRY_START
// Generated content will be inserted here by the static registry plugin
// STATIC_REGISTRY_END
`;

// A registration whose single-line form is 163 chars — past the 120-col Biome lineWidth — so a
// Biome pass is forced to wrap it. Its presence verbatim in the output means no formatting ran.
const LONG_COMPONENT: ComponentInfo[] = [
    {
        id: 'Layout.productCarousel',
        filePath: '/repo/src/components/product-carousel/index.tsx',
        relativePath: '../../components/product-carousel/index',
        hasLoader: true,
        hasClientLoader: false,
        hasFallback: true,
    },
];

const LONG_SINGLE_LINE =
    "    targetRegistry.registerImporter('Layout.productCarousel', () => import('../../components/product-carousel/index'), { loader: 'loader', fallback: 'fallback' });";

describe('updateRegistryFile formatting', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vol.reset();
    });

    it('formats the written file with the project Biome so over-width registrations are wrapped', () => {
        vol.fromJSON({ [REPO_REGISTRY_PATH]: SCAFFOLD });
        const generatedCode = generateRegistryCode(LONG_COMPONENT, 'registry');
        expect(generatedCode).toContain(LONG_SINGLE_LINE);

        const changed = updateRegistryFile(REPO_REGISTRY_PATH, generatedCode);

        expect(changed).toBe(true);
        const written = mockWriteFileSync.mock.calls[0][1] as string;
        expect(written).not.toContain(LONG_SINGLE_LINE);
        expect(written).toContain('registerImporter(');
        expect(written).not.toMatch(/ +\n/);
    });

    it('converges on a second run: an already-formatted file is left untouched (no HMR re-cascade)', () => {
        vol.fromJSON({ [REPO_REGISTRY_PATH]: SCAFFOLD });
        const generatedCode = generateRegistryCode(LONG_COMPONENT, 'registry');

        updateRegistryFile(REPO_REGISTRY_PATH, generatedCode);
        const formatted = mockWriteFileSync.mock.calls[0][1] as string;

        // Simulate the formatted file now on disk (the write above is mocked, so memfs is unchanged).
        vol.fromJSON({ [REPO_REGISTRY_PATH]: formatted });
        mockWriteFileSync.mockClear();

        const changed = updateRegistryFile(REPO_REGISTRY_PATH, generatedCode);

        expect(changed).toBe(false);
        expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it('falls back to unformatted content when Biome cannot run (bad working directory)', () => {
        vol.fromJSON({ [NO_FORMAT_PATH]: SCAFFOLD });
        const generatedCode = generateRegistryCode(LONG_COMPONENT, 'registry');

        const changed = updateRegistryFile(NO_FORMAT_PATH, generatedCode);

        expect(changed).toBe(true);
        const written = mockWriteFileSync.mock.calls[0][1] as string;
        expect(written).toContain(LONG_SINGLE_LINE);
    });
});

describe('generateRegistryCode formatting hygiene', () => {
    it('emits no trailing whitespace for an empty registry', () => {
        expect(generateRegistryCode([], 'registry')).not.toMatch(/ +\n/);
    });

    it('emits no trailing whitespace for a populated registry', () => {
        expect(generateRegistryCode(LONG_COMPONENT, 'registry')).not.toMatch(/ +\n/);
    });

    // The generated file is exempted in the project's eslint config (like other generated
    // artifacts), so a blanket `/* eslint-disable */` would be a no-op directive that
    // `--report-unused-disable-directives` flags as an error. Don't reintroduce it.
    it('does not emit a blanket eslint-disable directive', () => {
        expect(generateRegistryCode([], 'registry')).not.toContain('/* eslint-disable */');
        expect(generateRegistryCode(LONG_COMPONENT, 'registry')).not.toContain('/* eslint-disable */');
    });
});
