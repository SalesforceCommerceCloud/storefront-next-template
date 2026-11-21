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
import { describe, expect, it } from 'vitest';
import { createProtectedStateCodec } from './protected-state';

const oldKey = { id: 'old', key: new Uint8Array(32).fill(1) };
const newKey = { id: 'new', key: new Uint8Array(32).fill(2) };
const binding = { purpose: 'session', siteId: 'RefArch', origin: 'https://store.example' };

describe('protected state', () => {
    it('encrypts state and authenticates purpose, site, origin, and ciphertext', async () => {
        const codec = createProtectedStateCodec([oldKey]);
        const sealed = await codec.seal({ secret: 'verifier' }, binding);
        expect(sealed).not.toContain('verifier');
        expect(await codec.open(sealed, binding)).toEqual({ secret: 'verifier' });
        for (const other of [
            { ...binding, purpose: 'transaction' },
            { ...binding, siteId: 'Other' },
            { ...binding, origin: 'https://other.example' },
        ]) {
            await expect(codec.open(sealed, other)).rejects.toThrow('Invalid protected state');
        }
        const parts = sealed.split('.');
        parts[3] = `${parts[3][0] === 'A' ? 'B' : 'A'}${parts[3].slice(1)}`;
        await expect(codec.open(parts.join('.'), binding)).rejects.toThrow('Invalid protected state');
    });

    it('rotates keys without losing existing sessions', async () => {
        const previous = createProtectedStateCodec([oldKey]);
        const current = createProtectedStateCodec([newKey, oldKey]);
        const oldState = await previous.seal({ mode: 'active' }, binding);
        expect(await current.open(oldState, binding)).toEqual({ mode: 'active' });
        await expect(createProtectedStateCodec([newKey]).open(oldState, binding)).rejects.toThrow();
        await expect(previous.open(await current.seal({}, binding), binding)).rejects.toThrow();
    });

    it('rejects missing, duplicate, or wrong-sized keys', () => {
        expect(() => createProtectedStateCodec([])).toThrow();
        expect(() => createProtectedStateCodec([oldKey, oldKey])).toThrow();
        expect(() => createProtectedStateCodec([{ id: 'bad', key: new Uint8Array(16) }])).toThrow();
    });
});
