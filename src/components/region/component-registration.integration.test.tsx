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
import { render, screen, waitFor } from '@testing-library/react';
import { Component } from './component';
import type { ComponentType } from './index';
import { registry } from '@/lib/page-designer/registry';

const mockLogger = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }));
vi.mock('@/lib/logger', () => ({ createLogger: () => mockLogger }));

describe('Page Designer component registration integration', () => {
    beforeEach(() => {
        registry.clear();
        vi.clearAllMocks();
    });

    afterEach(() => registry.clear());

    it('contains a real registry rejection and lets a later mount retry', async () => {
        const failure = new Error('component import failed');
        const importer = vi
            .fn()
            .mockRejectedValueOnce(failure)
            .mockResolvedValueOnce({ default: () => <div data-testid="recovered-component">Recovered</div> });
        registry.registerImporter('Content.integrationFailure', importer);
        const component = {
            id: 'integration-failure',
            typeId: 'Content.integrationFailure',
        } as ComponentType;
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        try {
            const first = render(
                <div data-testid="surrounding-content">
                    <Component component={component} regionId="main" />
                </div>
            );

            await waitFor(() =>
                expect(mockLogger.error).toHaveBeenCalledWith(
                    'Failed to render Page Designer component "integration-failure" (Content.integrationFailure)',
                    expect.objectContaining({ error: failure })
                )
            );
            expect(screen.getByTestId('surrounding-content')).toBeInTheDocument();
            expect(importer).toHaveBeenCalledOnce();

            first.unmount();
            render(<Component component={component} regionId="main" />);

            await waitFor(() => expect(screen.getByTestId('recovered-component')).toBeInTheDocument());
            expect(importer).toHaveBeenCalledTimes(2);
        } finally {
            consoleError.mockRestore();
        }
    });
});
