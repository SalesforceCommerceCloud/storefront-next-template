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
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBundle } from './bundle';

vi.mock('./utils', () => ({
    getProjectPkg: vi.fn(() => ({ dependencies: {}, devDependencies: {} })),
    getProjectDependencyTree: vi.fn(() => null),
    getPwaKitDependencies: vi.fn(() => ({})),
}));

// Runs the real minimatch (no mock) so a minimatch major bump is exercised end to end.
describe('createBundle glob matching', () => {
    let buildDirectory: string;

    beforeEach(() => {
        buildDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-test-'));
        for (const file of [
            'server/index.js',
            'client/app.js',
            'client/app.stories.tsx',
            '.storybook/main.js',
            'storybook-static/index.html',
            'nested/__mocks__/mock.js',
        ]) {
            fs.outputFileSync(path.join(buildDirectory, file), '');
        }
    });

    afterEach(() => {
        fs.removeSync(buildDirectory);
    });

    const bundle = (ssr_only: string[], ssr_shared: string[]) =>
        createBundle({
            message: 'test',
            ssr_parameters: {},
            ssr_only,
            ssr_shared,
            buildDirectory,
            projectDirectory: buildDirectory,
            projectSlug: 'proj',
        });

    it('matches ssr_only and ssr_shared patterns against archived files', async () => {
        const result = await bundle(['server/**/*'], ['client/**/*']);

        expect(result.ssr_only).toEqual(['server/index.js']);
        expect(result.ssr_shared).toEqual(['client/app.js']);
    });

    it('excludes Storybook and mock files from the archive', async () => {
        const result = await bundle(['**/*'], ['**/*']);

        expect(result.ssr_only).toEqual(expect.arrayContaining(['server/index.js', 'client/app.js']));
        expect(result.ssr_shared).toEqual(expect.arrayContaining(['server/index.js', 'client/app.js']));
        expect([...result.ssr_only, ...result.ssr_shared].join()).not.toMatch(/stories|storybook|__mocks__/i);
    });

    it('treats a negated pattern as an exclusion', async () => {
        const result = await bundle(['**/*.js', '!client/**'], ['client/**/*']);

        expect(result.ssr_only).toEqual(['server/index.js']);
    });
});
