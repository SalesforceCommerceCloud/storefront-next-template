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
import { turboStreamEncode } from './turbo-stream';

describe('turboStreamEncode', () => {
    it('encodes a single-fetch loader response keyed by route id', () => {
        // The shape `stubPasskeyStatus()` fulfils: a resource-route loader response is
        // keyed by route id (`{ '<routeId>': { data } }`), unlike an action's bare `{ data }`.
        const out = turboStreamEncode({
            'routes/resource.passkey-status': { data: { hasPasskey: false } },
        });
        expect(out).toBe('[{"_1":2},"routes/resource.passkey-status",{"_3":4},"data",{"_5":6},"hasPasskey",false]\n');
    });

    it('encodes a bare action response', () => {
        const out = turboStreamEncode({ data: { success: true } });
        expect(out).toBe('[{"_1":2},"data",{"_3":4},"success",true]\n');
    });

    it('deduplicates repeated primitive leaves by slot index', () => {
        // Repeated values share a slot — `false` appears once and is referenced twice.
        const out = turboStreamEncode({ data: { a: false, b: false } });
        expect(out).toBe('[{"_1":2},"data",{"_3":4,"_5":4},"a",false,"b"]\n');
    });

    it('encodes arrays, null, and numbers', () => {
        const out = turboStreamEncode({ items: [1, null] });
        expect(out).toBe('[{"_1":2},"items",[3,4],1,null]\n');
    });

    it('escapes special characters in strings', () => {
        const out = turboStreamEncode({ data: 'a"b' });
        expect(out).toContain('"a\\"b"');
    });

    it('throws on unsupported value types', () => {
        expect(() => turboStreamEncode({ fn: () => undefined })).toThrow(/unsupported value/);
    });
});
