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
import { registry } from './registry';
import {
    getServerRenderedComponentTypeIds,
    registerComponentTypes,
    registerServerRenderedComponentTypes,
} from './registry-components';

vi.mock('./registry', () => ({ registry: { loadAndRegister: vi.fn() } }));

describe('server-rendered Page Designer registry components', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // oxlint-disable-next-line @typescript-eslint/unbound-method
        vi.mocked(registry.loadAndRegister).mockResolvedValue(undefined);
        document.body.replaceChildren();
    });

    it('deduplicates registrations in first-occurrence order', async () => {
        await registerComponentTypes(['Content.hero', 'Content.hero', 'Layout.grid']);

        // oxlint-disable-next-line @typescript-eslint/unbound-method
        expect(registry.loadAndRegister).toHaveBeenNthCalledWith(1, 'Content.hero');
        // oxlint-disable-next-line @typescript-eslint/unbound-method
        expect(registry.loadAndRegister).toHaveBeenNthCalledWith(2, 'Layout.grid');
        // oxlint-disable-next-line @typescript-eslint/unbound-method
        expect(registry.loadAndRegister).toHaveBeenCalledTimes(2);
    });

    it('waits for successful siblings before reporting one registration failure', async () => {
        let resolveSlow!: () => void;
        const slow = new Promise<void>((resolve) => {
            resolveSlow = resolve;
        });
        const failure = new Error('broken module');
        // oxlint-disable-next-line @typescript-eslint/unbound-method
        vi.mocked(registry.loadAndRegister).mockImplementation((typeId: string) =>
            typeId === 'Content.broken' ? Promise.reject(failure) : slow
        );

        const registration = registerComponentTypes(['Content.broken', 'Content.slow']);
        let settled = false;
        void registration.catch(() => {
            settled = true;
        });
        await Promise.resolve();

        expect(settled).toBe(false);
        resolveSlow();
        await expect(registration).rejects.toBe(failure);
    });

    it('aggregates multiple failures after every registration settles', async () => {
        // oxlint-disable-next-line @typescript-eslint/unbound-method
        vi.mocked(registry.loadAndRegister).mockImplementation((typeId: string) =>
            Promise.reject(new Error(`${typeId} failed`))
        );

        await expect(registerComponentTypes(['Content.one', 'Content.two'])).rejects.toThrow(
            'Failed to register Page Designer component types: Content.one, Content.two'
        );
    });

    it('discovers only exact critical component markers and preserves DOM order', () => {
        document.body.innerHTML = `
            <template data-page-designer-region-component-types='["Content.declaredOnly"]'></template>
            <template id="critical-one" data-page-designer-component-type="Layout.criticalOne"></template>
            <template id="critical-shared-one" data-page-designer-component-type="Content.shared"></template>
            <template id="critical-two" data-page-designer-component-type="Content.criticalTwo"></template>
            <template id="critical-shared-two" data-page-designer-component-type="Content.shared"></template>
        `;

        expect(getServerRenderedComponentTypeIds(document)).toEqual([
            'Layout.criticalOne',
            'Content.shared',
            'Content.criticalTwo',
        ]);
    });

    it('ignores empty marker values and registers exact types before DOMContentLoaded', async () => {
        document.body.innerHTML = `
            <template data-page-designer-component-type=""></template>
            <template data-page-designer-component-type="Content.critical"></template>
            <template data-page-designer-region-component-types='["Content.nonCritical"]'></template>
        `;
        Object.defineProperty(document, 'readyState', { configurable: true, value: 'loading' });

        await registerServerRenderedComponentTypes(document);

        expect(document.readyState).toBe('loading');
        // oxlint-disable-next-line @typescript-eslint/unbound-method
        expect(registry.loadAndRegister).toHaveBeenNthCalledWith(1, 'Content.critical');
        // oxlint-disable-next-line @typescript-eslint/unbound-method
        expect(registry.loadAndRegister).not.toHaveBeenCalledWith('Content.nonCritical');
        Reflect.deleteProperty(document, 'readyState');
    });

    it('does not observe markers appended after the initial scan', async () => {
        document.body.innerHTML = `
            <template data-page-designer-component-type="Content.initial"></template>
        `;

        await registerServerRenderedComponentTypes(document);
        const lateMarker = document.createElement('template');
        lateMarker.dataset.pageDesignerComponentType = 'Content.late';
        document.body.append(lateMarker);
        await Promise.resolve();

        // oxlint-disable-next-line @typescript-eslint/unbound-method
        expect(registry.loadAndRegister).toHaveBeenCalledOnce();
        // oxlint-disable-next-line @typescript-eslint/unbound-method
        expect(registry.loadAndRegister).not.toHaveBeenCalledWith('Content.late');
    });
});
