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

describe('buildConversationStorageKeys', () => {
    it('scopes keys to the deployment', async () => {
        const { buildConversationStorageKeys } = await import('./cimulate-conversation');
        expect(buildConversationStorageKeys('00D000000000001', 'Commerce_Agent')).toEqual({
            conversationTokenKey: 'cim_af_ct_00D000000000001_Commerce_Agent',
            conversationIdKey: 'cim_af_conv_00D000000000001_Commerce_Agent',
        });
    });
});

const convJson = (conversationId: string) => JSON.stringify({ conversationId, storedAt: 1 });
const tokenJson = (accessToken: string) => JSON.stringify({ accessToken });

describe('readCimulateConversationId', () => {
    afterEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('reads the parsed conversationId from localStorage', async () => {
        const { readCimulateConversationId } = await import('./cimulate-conversation');
        localStorage.setItem('k', convJson('conv-local'));
        expect(readCimulateConversationId('k')).toBe('conv-local');
    });

    it('prefers localStorage over sessionStorage', async () => {
        const { readCimulateConversationId } = await import('./cimulate-conversation');
        localStorage.setItem('k', convJson('conv-local'));
        sessionStorage.setItem('k', convJson('conv-session'));
        expect(readCimulateConversationId('k')).toBe('conv-local');
    });

    it('falls back to sessionStorage for older widget builds', async () => {
        const { readCimulateConversationId } = await import('./cimulate-conversation');
        sessionStorage.setItem('k', convJson('conv-session'));
        expect(readCimulateConversationId('k')).toBe('conv-session');
    });

    it.each([
        ['missing key', undefined],
        ['blank id', JSON.stringify({ conversationId: '  ' })],
        ['non-string id', JSON.stringify({ conversationId: 5 })],
        ['malformed JSON', 'not-json'],
        ['JSON null', 'null'],
    ])('treats %s as unavailable, never fatal', async (_label, stored) => {
        const { readCimulateConversationId } = await import('./cimulate-conversation');
        if (stored !== undefined) localStorage.setItem('k', stored);
        expect(readCimulateConversationId('k')).toBeUndefined();
    });

    it('treats a storage access error as unavailable, never fatal', async () => {
        const { readCimulateConversationId } = await import('./cimulate-conversation');
        const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('storage disabled');
        });
        expect(readCimulateConversationId('k')).toBeUndefined();
        spy.mockRestore();
    });
});

describe('readCimulateConversationToken', () => {
    afterEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('prefers sessionStorage over localStorage', async () => {
        const { readCimulateConversationToken } = await import('./cimulate-conversation');
        sessionStorage.setItem('k', tokenJson('session-token'));
        localStorage.setItem('k', tokenJson('local-token'));
        expect(readCimulateConversationToken('k')).toBe('session-token');
    });

    it('skips a store holding the excluded token and uses the other store', async () => {
        const { readCimulateConversationToken } = await import('./cimulate-conversation');
        sessionStorage.setItem('k', tokenJson('stale'));
        localStorage.setItem('k', tokenJson('fresh'));
        expect(readCimulateConversationToken('k', 'stale')).toBe('fresh');
    });

    it('returns undefined when every store holds the excluded token', async () => {
        const { readCimulateConversationToken } = await import('./cimulate-conversation');
        sessionStorage.setItem('k', tokenJson('stale'));
        expect(readCimulateConversationToken('k', 'stale')).toBeUndefined();
    });
});

describe('waitForRotatedConversationToken', () => {
    it('resolves immediately when the current value already differs from the excluded one', async () => {
        const { waitForRotatedConversationToken } = await import('./cimulate-conversation');
        sessionStorage.setItem('storage-key', tokenJson('new-token'));
        const sleepImpl = vi.fn().mockResolvedValue(undefined);

        await expect(waitForRotatedConversationToken('storage-key', 'old-token', { sleepImpl })).resolves.toBe(
            'new-token'
        );
        expect(sleepImpl).not.toHaveBeenCalled();
        sessionStorage.clear();
    });

    it('polls up to the bound with doubling delay capped at capMs, then gives up without a final sleep', async () => {
        const { waitForRotatedConversationToken } = await import('./cimulate-conversation');
        const sleepImpl = vi.fn().mockResolvedValue(undefined);

        const result = await waitForRotatedConversationToken('storage-key', undefined, {
            maxChecks: 4,
            initialDelayMs: 100,
            capMs: 300,
            sleepImpl,
        });

        expect(result).toBeUndefined();
        expect(sleepImpl).toHaveBeenCalledTimes(3);
        expect(sleepImpl).toHaveBeenNthCalledWith(1, 100);
        expect(sleepImpl).toHaveBeenNthCalledWith(2, 200);
        expect(sleepImpl).toHaveBeenNthCalledWith(3, 300);
    });

    it('resolves as soon as a rotated value appears mid-poll', async () => {
        const { waitForRotatedConversationToken } = await import('./cimulate-conversation');
        let check = 0;
        const sleepImpl = vi.fn().mockImplementation(() => {
            check += 1;
            if (check === 2) sessionStorage.setItem('storage-key', tokenJson('rotated'));
            return Promise.resolve();
        });

        const result = await waitForRotatedConversationToken('storage-key', undefined, {
            maxChecks: 8,
            initialDelayMs: 10,
            capMs: 10,
            sleepImpl,
        });

        expect(result).toBe('rotated');
        sessionStorage.clear();
    });
});

describe('buildCimulateIdentityKey', () => {
    it('keys registered shoppers by customerId', async () => {
        const { buildCimulateIdentityKey } = await import('./cimulate-conversation');
        expect(buildCimulateIdentityKey({ siteId: 'site', userType: 'registered', customerId: 'cust-1' })).toBe(
            'site:registered:cust-1'
        );
    });

    it('keys guest shoppers by usid', async () => {
        const { buildCimulateIdentityKey } = await import('./cimulate-conversation');
        expect(buildCimulateIdentityKey({ siteId: 'site', userType: 'guest', usid: 'usid-1' })).toBe(
            'site:guest:usid-1'
        );
    });
});

describe('classifyCimulateIdentityChange', () => {
    it('treats an unestablished baseline as no change', async () => {
        const { classifyCimulateIdentityChange } = await import('./cimulate-conversation');
        expect(classifyCimulateIdentityChange(undefined, { siteId: 'site', userType: 'guest', usid: 'usid-1' })).toBe(
            'none'
        );
    });

    it('treats a site switch as no change', async () => {
        const { classifyCimulateIdentityChange } = await import('./cimulate-conversation');
        expect(
            classifyCimulateIdentityChange(
                { siteId: 'site-a', userType: 'guest', usid: 'usid-1' },
                { siteId: 'site-b', userType: 'guest', usid: 'usid-1' }
            )
        ).toBe('none');
    });

    it('classifies guest to registered as login', async () => {
        const { classifyCimulateIdentityChange } = await import('./cimulate-conversation');
        expect(
            classifyCimulateIdentityChange(
                { siteId: 'site', userType: 'guest', usid: 'usid-1' },
                { siteId: 'site', userType: 'registered', customerId: 'cust-1' }
            )
        ).toBe('login');
    });

    it('classifies registered to guest as logout', async () => {
        const { classifyCimulateIdentityChange } = await import('./cimulate-conversation');
        expect(
            classifyCimulateIdentityChange(
                { siteId: 'site', userType: 'registered', customerId: 'cust-1' },
                { siteId: 'site', userType: 'guest', usid: 'usid-2' }
            )
        ).toBe('logout');
    });

    it('classifies a customerId change while registered as account-switch', async () => {
        const { classifyCimulateIdentityChange } = await import('./cimulate-conversation');
        expect(
            classifyCimulateIdentityChange(
                { siteId: 'site', userType: 'registered', customerId: 'cust-1' },
                { siteId: 'site', userType: 'registered', customerId: 'cust-2' }
            )
        ).toBe('account-switch');
    });

    it('classifies a usid change while guest as guest-rotation', async () => {
        const { classifyCimulateIdentityChange } = await import('./cimulate-conversation');
        expect(
            classifyCimulateIdentityChange(
                { siteId: 'site', userType: 'guest', usid: 'usid-1' },
                { siteId: 'site', userType: 'guest', usid: 'usid-2' }
            )
        ).toBe('guest-rotation');
    });

    it('classifies identical values as no change, regardless of object identity', async () => {
        const { classifyCimulateIdentityChange } = await import('./cimulate-conversation');
        expect(
            classifyCimulateIdentityChange(
                { siteId: 'site', userType: 'registered', customerId: 'cust-1' },
                { siteId: 'site', userType: 'registered', customerId: 'cust-1' }
            )
        ).toBe('none');
    });
});

describe('buildCimulateComboKey', () => {
    it('combines deployment, site, conversation, and identity into one key', async () => {
        const { buildCimulateComboKey } = await import('./cimulate-conversation');
        expect(buildCimulateComboKey('org', 'agent', 'site', 'conv-1', 'site:guest:usid-1')).toBe(
            'org:agent:site:conv-1:site:guest:usid-1'
        );
    });

    it('falls back to a stable placeholder when the conversation id is unknown', async () => {
        const { buildCimulateComboKey } = await import('./cimulate-conversation');
        expect(buildCimulateComboKey('org', 'agent', 'site', undefined, 'site:guest:usid-1')).toBe(
            'org:agent:site:unknown:site:guest:usid-1'
        );
    });
});

describe('generation, queue, and dedup primitives', () => {
    beforeEach(() => vi.resetModules());

    it('increments the generation and only the latest is current', async () => {
        const { nextCimulateLinkGeneration, isCurrentCimulateLinkGeneration } = await import('./cimulate-conversation');
        const first = nextCimulateLinkGeneration();
        const second = nextCimulateLinkGeneration();
        expect(second).toBeGreaterThan(first);
        expect(isCurrentCimulateLinkGeneration(first)).toBe(false);
        expect(isCurrentCimulateLinkGeneration(second)).toBe(true);
    });

    it('serializes queued work so an older attempt never resolves after a newer one starts out of order', async () => {
        const { enqueueCimulateLinkWork } = await import('./cimulate-conversation');
        const order: string[] = [];

        const slow = enqueueCimulateLinkWork(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20));
            order.push('first');
        });
        const fast = enqueueCimulateLinkWork(() => {
            order.push('second');
            return Promise.resolve();
        });

        await Promise.all([slow, fast]);
        expect(order).toEqual(['first', 'second']);
    });

    it('continues the queue after a rejected attempt', async () => {
        const { enqueueCimulateLinkWork } = await import('./cimulate-conversation');
        const order: string[] = [];

        const failing = enqueueCimulateLinkWork(() => {
            order.push('failed');
            return Promise.reject(new Error('boom'));
        });
        const next = enqueueCimulateLinkWork(() => {
            order.push('recovered');
            return Promise.resolve();
        });

        await expect(failing).rejects.toThrow('boom');
        await next;
        expect(order).toEqual(['failed', 'recovered']);
    });

    it('dedupes only the most recent successful combination', async () => {
        const { hasCimulateComboLinked, markCimulateComboLinked } = await import('./cimulate-conversation');
        expect(hasCimulateComboLinked('combo-1')).toBe(false);
        markCimulateComboLinked('combo-1');
        expect(hasCimulateComboLinked('combo-1')).toBe(true);
        markCimulateComboLinked('combo-2');
        expect(hasCimulateComboLinked('combo-1')).toBe(false);
        expect(hasCimulateComboLinked('combo-2')).toBe(true);
    });

    it('forgets the linked combination when cleared', async () => {
        const { clearCimulateLinkedCombo, hasCimulateComboLinked, markCimulateComboLinked } = await import(
            './cimulate-conversation'
        );
        markCimulateComboLinked('combo-1');
        clearCimulateLinkedCombo();
        expect(hasCimulateComboLinked('combo-1')).toBe(false);
    });

    it('claims the initial evaluation exactly once', async () => {
        const { claimInitialCimulateEvaluation } = await import('./cimulate-conversation');
        expect(claimInitialCimulateEvaluation()).toBe(true);
        expect(claimInitialCimulateEvaluation()).toBe(false);
    });
});
