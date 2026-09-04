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

const mocks = vi.hoisted(() => ({
    hydrateRoot: vi.fn(),
    initializeRegistry: vi.fn(),
    whenI18nReady: vi.fn<() => Promise<void>>(),
    loadComponents: vi.fn<(root: ParentNode) => Promise<void>>(),
    logger: { error: vi.fn() },
}));

vi.mock('react-dom/client', () => ({ hydrateRoot: mocks.hydrateRoot }));
vi.mock('react-router/dom', () => ({ HydratedRouter: () => null }));
vi.mock('@/i18n-client-init', () => ({ whenI18nReady: mocks.whenI18nReady }));
vi.mock('@/lib/page-designer/static-registry', () => ({ initializeRegistry: mocks.initializeRegistry }));
vi.mock('@/lib/page-designer/registry-components', () => ({
    registerServerRenderedComponentTypes: mocks.loadComponents,
}));
vi.mock('@/lib/logger', () => ({ createLogger: () => mocks.logger }));

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

describe('client hydration entry', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    it('initializes importers and hydrates only after i18n and component registration settle', async () => {
        const i18n = deferred();
        const components = deferred();
        mocks.whenI18nReady.mockReturnValue(i18n.promise);
        mocks.loadComponents.mockReturnValue(components.promise);

        await import('./entry.client');

        expect(mocks.initializeRegistry).toHaveBeenCalledOnce();
        expect(mocks.initializeRegistry.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.loadComponents.mock.invocationCallOrder[0]
        );
        expect(mocks.loadComponents).toHaveBeenCalledWith(document);
        expect(mocks.hydrateRoot).not.toHaveBeenCalled();

        i18n.resolve();
        await Promise.resolve();
        expect(mocks.hydrateRoot).not.toHaveBeenCalled();

        components.resolve();
        await vi.waitFor(() => expect(mocks.hydrateRoot).toHaveBeenCalledOnce());
    });

    it('logs a registration failure and still hydrates', async () => {
        const failure = new Error('registration failed');
        mocks.whenI18nReady.mockResolvedValue(undefined);
        mocks.loadComponents.mockRejectedValue(failure);

        await import('./entry.client');

        await vi.waitFor(() => expect(mocks.hydrateRoot).toHaveBeenCalledOnce());
        expect(mocks.logger.error).toHaveBeenCalledWith(
            'Failed to prepare server-rendered Page Designer components for hydration',
            { error: failure }
        );
    });
});
