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

/**
 * Minimal React Router single-fetch (turbo-stream) encoder for plain objects with
 * primitive leaves. Mirrors the upstream flatten/stringify walk so output is
 * byte-for-byte decodable by React Router's `decodeViaTurboStream`. Handles only the
 * subset the E2E loader/BFF stubs need (objects, arrays, strings, numbers, booleans,
 * null). Used by Playwright route stubs that must fulfil a `.data` loader/action
 * response in the exact wire format the browser expects.
 */
export function turboStreamEncode(input: unknown): string {
    const slots: string[] = [];
    const indices = new Map<unknown, number>();

    function flatten(value: unknown): number {
        const existing = indices.get(value);
        if (existing !== undefined) return existing;
        const index = slots.length;
        indices.set(value, index);
        slots.push('');
        slots[index] = stringify(value);
        return index;
    }

    function stringify(value: unknown): string {
        if (value === null) return 'null';
        switch (typeof value) {
            case 'boolean':
            case 'number':
            case 'string':
                return JSON.stringify(value);
            case 'object': {
                if (Array.isArray(value)) {
                    return `[${value.map(flatten).join(',')}]`;
                }
                const obj = value as Record<string, unknown>;
                const parts = Object.keys(obj).map((k) => `"_${flatten(k)}":${flatten(obj[k])}`);
                return `{${parts.join(',')}}`;
            }
        }
        throw new Error(`turboStreamEncode: unsupported value of type ${typeof value}`);
    }

    flatten(input);
    return `[${slots.join(',')}]\n`;
}
