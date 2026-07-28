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
import type { Request, Response } from 'express';
import { pathEndsWith } from '../../test-utils';
import { createHealthCheckHandler } from './health-check';

vi.mock('node:fs', () => ({
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
}));

const { existsSync, readFileSync } = await import('node:fs');

describe('health-check handler', () => {
    const projectDirectory = '/test/project';
    const bundleId = 'bundle-123';

    const createResponse = () =>
        ({
            status: vi.fn().mockReturnThis(),
            type: vi.fn().mockReturnThis(),
            json: vi.fn(),
        }) as unknown as Response;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns health response with package metadata', () => {
        vi.mocked(existsSync).mockImplementation((path) =>
            pathEndsWith(path as string, `${projectDirectory}/build/package.json`)
        );

        vi.mocked(readFileSync).mockImplementation((path) => {
            if (pathEndsWith(path as string, `${projectDirectory}/build/package.json`)) {
                return JSON.stringify({
                    version: '1.2.3',
                    description: 'Example storefront application',
                    dependencies: {
                        '@salesforce/storefront-next-runtime': '0.3.1',
                    },
                    devDependencies: {
                        '@salesforce/storefront-next-dev': '0.3.0',
                    },
                });
            }

            throw new Error('Unexpected path');
        });

        const handler = createHealthCheckHandler({ projectDirectory, bundleId });
        const res = createResponse();
        handler({} as Request, res, vi.fn());

        // oxlint-disable-next-line @typescript-eslint/unbound-method
        expect(res.status).toHaveBeenCalledWith(200);
        // oxlint-disable-next-line @typescript-eslint/unbound-method
        expect(res.type).toHaveBeenCalledWith('application/health+json');
        expect(res.json).toHaveBeenCalledWith({
            status: 'pass',
            version: '1.2.3',
            bundleId,
            description: 'Example storefront application',
            notes: [
                'Built using @salesforce/storefront-next-dev@0.3.0.',
                'Running @salesforce/storefront-next-runtime@0.3.1.',
            ],
        });
    });

    it('falls back to defaults when metadata is missing', () => {
        vi.mocked(existsSync).mockReturnValue(false);

        const handler = createHealthCheckHandler({ projectDirectory, bundleId });
        const res = createResponse();
        handler({} as Request, res, vi.fn());

        expect(res.json).toHaveBeenCalledWith({
            status: 'pass',
            version: undefined,
            bundleId,
            description: 'storefront-next-dev server health',
            notes: undefined,
        });
    });

    it('uses root package.json for local bundles', () => {
        vi.mocked(existsSync).mockImplementation((path) =>
            pathEndsWith(path as string, `${projectDirectory}/package.json`)
        );

        vi.mocked(readFileSync).mockImplementation((path) => {
            if (pathEndsWith(path as string, `${projectDirectory}/package.json`)) {
                return JSON.stringify({
                    version: '1.2.3',
                    description: 'Example storefront application',
                });
            }

            throw new Error('Unexpected path');
        });

        const handler = createHealthCheckHandler({ projectDirectory, bundleId: 'local' });
        const res = createResponse();
        handler({} as Request, res, vi.fn());

        expect(res.json).toHaveBeenCalledWith({
            status: 'pass',
            version: '1.2.3',
            bundleId: 'local',
            description: 'Example storefront application',
            notes: undefined,
        });
    });

    it('omits notes when package versions are unavailable', () => {
        vi.mocked(existsSync).mockImplementation((path) =>
            pathEndsWith(path as string, `${projectDirectory}/build/package.json`)
        );

        vi.mocked(readFileSync).mockImplementation((path) => {
            if (pathEndsWith(path as string, `${projectDirectory}/build/package.json`)) {
                return JSON.stringify({
                    version: '1.2.3',
                    description: 'Example storefront application',
                });
            }

            throw new Error('Unexpected path');
        });

        const handler = createHealthCheckHandler({ projectDirectory, bundleId });
        const res = createResponse();
        handler({} as Request, res, vi.fn());

        expect(res.json).toHaveBeenCalledWith({
            status: 'pass',
            version: '1.2.3',
            bundleId,
            description: 'Example storefront application',
            notes: undefined,
        });
    });

    it('handles invalid package.json content gracefully', () => {
        vi.mocked(existsSync).mockImplementation((path) =>
            pathEndsWith(path as string, `${projectDirectory}/build/package.json`)
        );

        vi.mocked(readFileSync).mockImplementation((path) => {
            if (pathEndsWith(path as string, `${projectDirectory}/build/package.json`)) {
                return '{ invalid json';
            }

            throw new Error('Unexpected path');
        });

        const handler = createHealthCheckHandler({ projectDirectory, bundleId });
        const res = createResponse();
        handler({} as Request, res, vi.fn());

        expect(res.json).toHaveBeenCalledWith({
            status: 'pass',
            version: undefined,
            bundleId,
            description: 'storefront-next-dev server health',
            notes: undefined,
        });
    });

    it('includes only the dev package note when runtime version is missing', () => {
        vi.mocked(existsSync).mockImplementation((path) =>
            pathEndsWith(path as string, `${projectDirectory}/build/package.json`)
        );

        vi.mocked(readFileSync).mockImplementation((path) => {
            if (pathEndsWith(path as string, `${projectDirectory}/build/package.json`)) {
                return JSON.stringify({
                    version: '1.2.3',
                    description: 'Example storefront application',
                    devDependencies: {
                        '@salesforce/storefront-next-dev': '0.3.0',
                    },
                });
            }

            throw new Error('Unexpected path');
        });

        const handler = createHealthCheckHandler({ projectDirectory, bundleId });
        const res = createResponse();
        handler({} as Request, res, vi.fn());

        expect(res.json).toHaveBeenCalledWith({
            status: 'pass',
            version: '1.2.3',
            bundleId,
            description: 'Example storefront application',
            notes: ['Built using @salesforce/storefront-next-dev@0.3.0.'],
        });
    });

    it('includes only the runtime package note when dev version is missing', () => {
        vi.mocked(existsSync).mockImplementation((path) =>
            pathEndsWith(path as string, `${projectDirectory}/build/package.json`)
        );

        vi.mocked(readFileSync).mockImplementation((path) => {
            if (pathEndsWith(path as string, `${projectDirectory}/build/package.json`)) {
                return JSON.stringify({
                    version: '1.2.3',
                    description: 'Example storefront application',
                    dependencies: {
                        '@salesforce/storefront-next-runtime': '0.3.1',
                    },
                });
            }

            throw new Error('Unexpected path');
        });

        const handler = createHealthCheckHandler({ projectDirectory, bundleId });
        const res = createResponse();
        handler({} as Request, res, vi.fn());

        expect(res.json).toHaveBeenCalledWith({
            status: 'pass',
            version: '1.2.3',
            bundleId,
            description: 'Example storefront application',
            notes: ['Running @salesforce/storefront-next-runtime@0.3.1.'],
        });
    });
});
