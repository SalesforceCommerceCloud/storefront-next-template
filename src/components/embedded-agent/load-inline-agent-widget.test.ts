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

import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';

const { warningSpy, errorSpy } = vi.hoisted(() => ({ warningSpy: vi.fn(), errorSpy: vi.fn() }));
vi.mock('@/lib/logger', () => ({
    createLogger: () => ({ warn: warningSpy, error: errorSpy }),
    serializeError: () => ({}),
}));

const SOURCE = 'https://cdn.search.cimulate.ai/inline-agent-widget/0.1.0/inline-agent-widget.umd.js';

describe('inline widget script registration', () => {
    let load: (source: string) => Promise<void>;
    let register: () => void;
    let definedSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
        vi.resetModules();
        vi.useFakeTimers();
        warningSpy.mockClear();
        errorSpy.mockClear();
        load = (await import('./load-inline-agent-widget')).loadInlineAgentWidget;
        let constructor: CustomElementConstructor | undefined;
        let resolve!: (value: CustomElementConstructor) => void;
        const registered = new Promise<CustomElementConstructor>((yes) => {
            resolve = yes;
        });
        vi.spyOn(customElements, 'get').mockImplementation(() => constructor);
        definedSpy = vi.spyOn(customElements, 'whenDefined').mockReturnValue(registered);
        register = () => {
            constructor = class extends HTMLElement {};
            resolve(constructor);
        };
    });

    afterEach(() => {
        document.head.querySelectorAll(`script[src="${SOURCE}"]`).forEach((script) => script.remove());
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    const script = () => {
        const element = document.querySelector<HTMLScriptElement>(`script[src="${SOURCE}"]`);
        if (!element) throw new Error('Expected the widget script');
        return element;
    };

    test('an already registered element needs no download or warning timer', async () => {
        register();
        await load(SOURCE);
        expect(document.querySelector(`script[src="${SOURCE}"]`)).toBeNull();
        expect(definedSpy).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    test('concurrent consumers share registration and one listener-bound script', async () => {
        const first = load(SOURCE);
        expect(load(SOURCE)).toBe(first);
        expect(document.querySelectorAll(`script[src="${SOURCE}"]`)).toHaveLength(1);
        expect(script().async).toBe(true);
        expect(definedSpy).toHaveBeenCalledTimes(1);
        register();
        await first;
        expect(vi.getTimerCount()).toBe(0);
        script().dispatchEvent(new Event('error'));
        expect(script()).not.toBeNull();
        expect(load(SOURCE)).toBe(first);
    });

    test('registration before the warning threshold reuses the original SSR node', async () => {
        const existing = document.createElement('script');
        existing.src = SOURCE;
        document.head.appendChild(existing);
        const appendSpy = vi.spyOn(document.head, 'appendChild');
        const waiting = load(SOURCE);
        vi.advanceTimersByTime(9999);
        register();
        await waiting;
        vi.advanceTimersByTime(1);
        expect(warningSpy).not.toHaveBeenCalled();
        expect(script()).toBe(existing);
        expect(appendSpy).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    test.each([
        'stalled',
        'loaded without registration',
        'failed before hydration',
    ])('warns once for a script that %s and still accepts late registration', async (condition) => {
        const existing = document.createElement('script');
        existing.src = SOURCE;
        document.head.appendChild(existing);
        if (condition === 'failed before hydration') existing.dispatchEvent(new Event('error'));
        const waiting = load(SOURCE);
        const completed = vi.fn();
        void waiting.then(completed, () => {});
        if (condition === 'loaded without registration') existing.dispatchEvent(new Event('load'));
        vi.advanceTimersByTime(9999);
        expect(warningSpy).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        await Promise.resolve();
        expect(warningSpy).toHaveBeenCalledWith(
            'Inline agent widget CDN script registration is taking longer than 10 seconds',
            { scriptSrc: SOURCE }
        );
        expect(completed).not.toHaveBeenCalled();
        expect(script()).toBe(existing);
        expect(load(SOURCE)).toBe(waiting);
        vi.advanceTimersByTime(20000);
        expect(warningSpy).toHaveBeenCalledTimes(1);
        register();
        await waiting;
        expect(completed).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
        existing.dispatchEvent(new Event('error'));
        expect(script()).toBe(existing);
    });

    test.each([0, 10000])('a download error after %i ms removes the failed tag and permits retry', async (delay) => {
        const waiting = load(SOURCE);
        const failed = script();
        const failure = waiting.catch((error: unknown) => error);
        vi.advanceTimersByTime(delay);
        failed.dispatchEvent(new Event('error'));
        expect(await failure).toEqual(new Error(`Failed to load inline-agent-widget UMD at ${SOURCE}`));
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(failed.isConnected).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
        const retry = load(SOURCE);
        expect(script()).not.toBe(failed);
        register();
        await Promise.resolve();
        expect(load(SOURCE)).toBe(retry);
        await retry;
        expect(vi.getTimerCount()).toBe(0);
    });
});
