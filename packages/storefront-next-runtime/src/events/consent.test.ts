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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEventMediator, getConsentAwareEventMediator, resetEventMediator } from './mediator';
import { sendViewPageEvent } from './events';
import type { ConsentPreferences, EventAdapter, EventMediator } from './types';

function setup() {
    const onConsentChange = vi.fn();
    const sendEvent = vi.fn().mockResolvedValue(undefined);
    const adapters: EventAdapter[] = [{ name: 'recording', onConsentChange, sendEvent }];
    const mediator = getConsentAwareEventMediator(() => [...adapters]);
    if (!mediator) throw new Error('Expected a browser mediator');
    return { adapters, mediator, onConsentChange, sendEvent };
}

afterEach(() => {
    resetEventMediator();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('consent notification', () => {
    it('keeps custom track-only mediators compatible with sendViewPageEvent', () => {
        const track = vi.fn();
        const customMediator: EventMediator = { track };
        const event = { eventType: 'view_page' as const, path: '/', payload: { userType: 'guest' as const } };
        sendViewPageEvent(event, customMediator, undefined, ['analytics']);
        expect(track).toHaveBeenCalledExactlyOnceWith(event, undefined, ['analytics']);
    });

    it('preserves the original getter return type for track-only test doubles', () => {
        const customMediator: EventMediator = { track: vi.fn() };
        const mock = vi.fn<typeof getEventMediator>();
        vi.mocked(mock).mockReturnValue(customMediator);
        expect(mock(() => [])).toBe(customMediator);
        expect(mock).toHaveBeenCalledOnce();
    });

    it('returns the same singleton from both getters', () => {
        expect(getEventMediator(() => [])).toBe(getConsentAwareEventMediator(() => []));
    });

    it('skips an adapter removed by an earlier consent callback', () => {
        const { adapters, mediator, onConsentChange } = setup();
        const removed = adapters[0];
        adapters.unshift({
            name: 'remover',
            onConsentChange: () => {
                adapters.splice(adapters.indexOf(removed), 1);
            },
        });
        mediator.notifyConsentChange(['marketing']);
        expect(onConsentChange).not.toHaveBeenCalled();
    });

    it('does not warn for consent-only adapters while preserving warnings for empty adapters', () => {
        const { adapters, mediator } = setup();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        adapters.push({ name: 'consent-only', onConsentChange: vi.fn() });
        const event = { eventType: 'view_page' as const, path: '/', payload: { userType: 'guest' as const } };
        mediator.notifyConsentChange(['marketing']);
        mediator.track(event, undefined, ['marketing']);
        expect(warn).not.toHaveBeenCalled();
        adapters.push({ name: 'empty' });
        mediator.track(event, undefined, ['marketing']);
        expect(warn).toHaveBeenCalledExactlyOnceWith('Adapter empty does not implement sendEvent');
    });

    it('distinguishes unpublished, unknown, declined and granted without sending events', () => {
        const { adapters, mediator, onConsentChange, sendEvent } = setup();
        mediator.syncAdapterConsent(adapters[0]);
        expect(onConsentChange).not.toHaveBeenCalled();
        mediator.notifyConsentChange(undefined);
        mediator.notifyConsentChange([]);
        mediator.notifyConsentChange(['marketing']);
        mediator.notifyConsentChange([]);
        mediator.notifyConsentChange(['marketing']);
        expect(onConsentChange.mock.calls).toEqual([[undefined], [[]], [['marketing']], [[]], [['marketing']]]);
        expect(sendEvent).not.toHaveBeenCalled();
    });

    it('deduplicates equivalent category sets and synchronizes new instances', () => {
        const { adapters, mediator, onConsentChange } = setup();
        mediator.notifyConsentChange(['marketing', 'analytics']);
        mediator.notifyConsentChange(['analytics', 'marketing', 'analytics']);
        mediator.syncAdapterConsent(adapters[0]);
        expect(onConsentChange).toHaveBeenCalledTimes(1);
        const late = { name: 'late', onConsentChange: vi.fn() };
        adapters.push(late);
        mediator.syncAdapterConsent(late);
        expect(late.onConsentChange).toHaveBeenCalledWith(['marketing', 'analytics']);
        mediator.notifyConsentChange([]);
        const replacement = { name: 'late', onConsentChange: vi.fn() };
        adapters.splice(1, 1, replacement);
        mediator.syncAdapterConsent(replacement);
        expect(replacement.onConsentChange).toHaveBeenCalledExactlyOnceWith([]);
        mediator.notifyConsentChange(['marketing']);
        expect(late.onConsentChange).toHaveBeenCalledTimes(2);
    });

    it('retains current state with an empty registry and synchronizes before an event', () => {
        const { adapters, mediator, onConsentChange, sendEvent } = setup();
        const adapter = adapters.pop();
        if (!adapter) throw new Error('Expected a registered adapter');
        mediator.notifyConsentChange([]);
        mediator.notifyConsentChange(['marketing']);
        adapters.push(adapter);
        mediator.track({ eventType: 'view_page', path: '/', payload: { userType: 'guest' } }, undefined, ['marketing']);
        expect(onConsentChange).toHaveBeenCalledWith(['marketing']);
        expect(onConsentChange.mock.invocationCallOrder[0]).toBeLessThan(sendEvent.mock.invocationCallOrder[0]);
    });

    it('copies input and callback preferences so adapters cannot change shared state', () => {
        const { adapters, mediator, onConsentChange } = setup();
        adapters.unshift({
            name: 'mutator',
            onConsentChange: (preferences) => {
                preferences?.push('extra');
            },
        });
        const preferences = ['marketing'];
        mediator.notifyConsentChange(preferences);
        preferences.push('analytics');
        expect(onConsentChange).toHaveBeenCalledWith(['marketing']);
        const late = { name: 'late', onConsentChange: vi.fn() };
        mediator.syncAdapterConsent(late);
        expect(late.onConsentChange).toHaveBeenCalledWith(['marketing']);
    });

    it('isolates throws and rejections without delaying withdrawal behind pending promises', async () => {
        const { adapters, mediator, onConsentChange } = setup();
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
        let resolve: (() => void) | undefined;
        const pending = new Promise<void>((done) => {
            resolve = done;
        });
        adapters.unshift(
            {
                name: 'throws',
                onConsentChange: () => {
                    throw new Error('failure');
                },
            },
            { name: 'rejects', onConsentChange: () => Promise.reject(new Error('failure')) },
            { name: 'pending', onConsentChange: () => pending }
        );
        mediator.notifyConsentChange(['marketing']);
        mediator.notifyConsentChange([]);
        expect(onConsentChange.mock.calls).toEqual([[['marketing']], [[]]]);
        if (!resolve) throw new Error('Expected pending callback resolver');
        resolve();
        await Promise.resolve();
        expect(errorLog).toHaveBeenCalledTimes(4);
    });

    it('makes reentrant synchronization safe and avoids stale delivery after nested withdrawal', () => {
        const { adapters, mediator, onConsentChange } = setup();
        const reentrant: EventAdapter = {
            name: 'reentrant',
            onConsentChange: (preferences) => {
                mediator.syncAdapterConsent(reentrant);
                if (preferences?.length) mediator.notifyConsentChange([]);
            },
        };
        adapters.unshift(reentrant);
        mediator.notifyConsentChange(['marketing']);
        expect(onConsentChange).toHaveBeenCalledExactlyOnceWith([]);
    });

    it('limits stale event preferences to current consent without broadening event permissions', () => {
        const { mediator, sendEvent } = setup();
        const event = { eventType: 'view_page' as const, path: '/', payload: { userType: 'guest' as const } };
        mediator.notifyConsentChange(['analytics', 'marketing']);
        mediator.notifyConsentChange([]);
        mediator.track(event, undefined, ['analytics', 'marketing']);
        mediator.notifyConsentChange(undefined);
        mediator.track(event, undefined, ['analytics', 'marketing']);
        expect(sendEvent).not.toHaveBeenCalled();
        mediator.notifyConsentChange(['analytics']);
        mediator.track(event, undefined, ['analytics', 'marketing']);
        expect(sendEvent).toHaveBeenCalledExactlyOnceWith(event, undefined, ['analytics']);
        mediator.track(event, undefined, ['marketing']);
        mediator.track(event, undefined, undefined);
        mediator.track(event, undefined, []);
        expect(sendEvent).toHaveBeenCalledTimes(1);
    });

    it('rechecks consent after a late adapter callback withdraws it during event dispatch', () => {
        const { adapters, mediator, sendEvent } = setup();
        const adapter = adapters.pop();
        if (!adapter) throw new Error('Expected a registered adapter');
        mediator.notifyConsentChange(['marketing']);
        adapter.onConsentChange = (preferences) => {
            if (preferences?.length) mediator.notifyConsentChange([]);
        };
        adapters.push(adapter);
        mediator.track({ eventType: 'view_page', path: '/', payload: { userType: 'guest' } }, undefined, ['marketing']);
        expect(sendEvent).not.toHaveBeenCalled();
    });

    it('resets retained consent and never returns a mediator on the server', () => {
        const { mediator } = setup();
        mediator.notifyConsentChange(['marketing']);
        vi.stubGlobal('window', undefined);
        expect(getConsentAwareEventMediator(() => [])).toBeUndefined();
        vi.unstubAllGlobals();
        resetEventMediator();
        const adapter = {
            name: 'fresh',
            onConsentChange: vi.fn<(preferences: ConsentPreferences | undefined) => void>(),
        };
        getConsentAwareEventMediator(() => [adapter])?.syncAdapterConsent(adapter);
        expect(adapter.onConsentChange).not.toHaveBeenCalled();
    });
});
