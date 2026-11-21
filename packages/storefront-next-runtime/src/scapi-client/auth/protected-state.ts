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
import { CompactEncrypt, compactDecrypt } from 'jose';

export interface ProtectedStateKey {
    id: string;
    /** 256-bit deployment secret, injected by server-only configuration. */
    key: Uint8Array;
}

export interface ProtectedStateBinding {
    purpose: string;
    siteId: string;
    origin: string;
}

/** Authenticated encryption with key rotation. Callers validate payload shape and transaction age. */
export function createProtectedStateCodec(keys: readonly ProtectedStateKey[]) {
    if (
        !keys.length ||
        new Set(keys.map(({ id }) => id)).size !== keys.length ||
        keys.some(({ id, key }) => !id || key.length !== 32)
    ) {
        throw new Error('Invalid protected-state key ring');
    }
    const encoder = new TextEncoder();
    const bindingValue = ({ purpose, siteId, origin }: ProtectedStateBinding) =>
        JSON.stringify([purpose, siteId, origin]);
    return {
        async seal(value: unknown, binding: ProtectedStateBinding): Promise<string> {
            return new CompactEncrypt(encoder.encode(JSON.stringify(value)))
                .setProtectedHeader({
                    alg: 'dir',
                    enc: 'A256GCM',
                    kid: keys[0].id,
                    typ: 'sfnext-state',
                    v: 1,
                    binding: bindingValue(binding),
                })
                .encrypt(keys[0].key);
        },
        async open(value: string, binding: ProtectedStateBinding): Promise<unknown> {
            try {
                const { plaintext, protectedHeader } = await compactDecrypt(
                    value,
                    (header) => {
                        const key = keys.find(({ id }) => id === header.kid);
                        if (!key) throw new Error();
                        return key.key;
                    },
                    { keyManagementAlgorithms: ['dir'], contentEncryptionAlgorithms: ['A256GCM'] }
                );
                if (
                    protectedHeader.typ !== 'sfnext-state' ||
                    protectedHeader.v !== 1 ||
                    protectedHeader.binding !== bindingValue(binding)
                )
                    throw new Error();
                const envelope: unknown = JSON.parse(new TextDecoder().decode(plaintext));
                return envelope;
            } catch {
                throw new Error('Invalid protected state');
            }
        },
    };
}
