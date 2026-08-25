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
import Remove from './remove';
import { manageExtensions } from '../../extensibility/manage-extensions';

// Mock dependencies
vi.mock('../../extensibility/manage-extensions', () => ({
    manageExtensions: vi.fn(() => Promise.resolve()),
}));

describe('extensions remove command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should call manageExtensions with uninstall=true and parsed extensions', async () => {
        const cmd = new Remove([], {} as never);

        vi.spyOn(cmd as any, 'parse').mockResolvedValue({
            flags: {
                'project-directory': '/test/project',
                extensions: 'SFDC_EXT_STORE_LOCATOR,SFDC_EXT_BOPIS',
                yes: true,
            },
            args: {},
            argv: [],
            raw: [],
            metadata: {},
        });

        await cmd.run();

        expect(manageExtensions).toHaveBeenCalledWith({
            projectDirectory: '/test/project',
            uninstall: true,
            extensions: ['SFDC_EXT_STORE_LOCATOR', 'SFDC_EXT_BOPIS'],
            yes: true,
        });
    });

    it('should pass undefined extensions when not provided', async () => {
        const cmd = new Remove([], {} as never);

        vi.spyOn(cmd as any, 'parse').mockResolvedValue({
            flags: {
                'project-directory': '/test/project',
                extensions: undefined,
                yes: false,
            },
            args: {},
            argv: [],
            raw: [],
            metadata: {},
        });

        await cmd.run();

        expect(manageExtensions).toHaveBeenCalledWith({
            projectDirectory: '/test/project',
            uninstall: true,
            extensions: undefined,
            yes: false,
        });
    });

    it('should trim whitespace from extension names', async () => {
        const cmd = new Remove([], {} as never);

        vi.spyOn(cmd as any, 'parse').mockResolvedValue({
            flags: {
                'project-directory': '/test/project',
                extensions: ' SFDC_EXT_A , SFDC_EXT_B ',
                yes: false,
            },
            args: {},
            argv: [],
            raw: [],
            metadata: {},
        });

        await cmd.run();

        expect(manageExtensions).toHaveBeenCalledWith({
            projectDirectory: '/test/project',
            uninstall: true,
            extensions: ['SFDC_EXT_A', 'SFDC_EXT_B'],
            yes: false,
        });
    });
});
