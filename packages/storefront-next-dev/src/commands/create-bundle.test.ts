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
import CreateBundle from './create-bundle';
import { createBundleCommand } from '../lib/create-bundle';

// Mock dependencies
vi.mock('../lib/create-bundle', () => ({
    createBundleCommand: vi.fn(() => Promise.resolve()),
}));

describe('create-bundle command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should call createBundleCommand with all flags', async () => {
        const cmd = new CreateBundle([], {} as never);

        vi.spyOn(cmd as any, 'parse').mockResolvedValue({
            flags: {
                'project-directory': '/test/project',
                'build-directory': '/test/build',
                'output-directory': '/test/output',
                message: 'Test bundle',
                'project-slug': 'my-project',
                'bundle-version': '2',
            },
            args: {},
            argv: [],
            raw: [],
            metadata: {},
        });
        vi.spyOn(cmd, 'log').mockImplementation(() => {});

        await cmd.run();

        expect(createBundleCommand).toHaveBeenCalledWith({
            projectDirectory: '/test/project',
            buildDirectory: '/test/build',
            outputDirectory: '/test/output',
            message: 'Test bundle',
            projectSlug: 'my-project',
            bundleVersion: '2',
        });
    });

    it('should pass undefined for optional flags when not provided', async () => {
        const cmd = new CreateBundle([], {} as never);

        vi.spyOn(cmd as any, 'parse').mockResolvedValue({
            flags: {
                'project-directory': '/test/project',
                'build-directory': undefined,
                'output-directory': undefined,
                message: undefined,
                'project-slug': undefined,
            },
            args: {},
            argv: [],
            raw: [],
            metadata: {},
        });
        vi.spyOn(cmd, 'log').mockImplementation(() => {});

        await cmd.run();

        expect(createBundleCommand).toHaveBeenCalledWith({
            projectDirectory: '/test/project',
            buildDirectory: undefined,
            outputDirectory: undefined,
            message: undefined,
            projectSlug: undefined,
            bundleVersion: undefined,
        });
    });

    it('should log success message after bundle creation', async () => {
        const cmd = new CreateBundle([], {} as never);

        vi.spyOn(cmd as any, 'parse').mockResolvedValue({
            flags: {
                'project-directory': '/test/project',
            },
            args: {},
            argv: [],
            raw: [],
            metadata: {},
        });
        const logSpy = vi.spyOn(cmd, 'log').mockImplementation(() => {});

        await cmd.run();

        expect(logSpy).toHaveBeenCalledWith('Bundle created successfully!');
    });
});
