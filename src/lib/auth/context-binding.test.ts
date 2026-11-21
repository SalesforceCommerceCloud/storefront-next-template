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
import { AUTH_CONTEXT_QUERY, bindAuthContext } from '@/lib/auth/context-binding';

describe('bindAuthContext', () => {
    it('returns the action unchanged when there is no version', () => {
        expect(bindAuthContext('/cart?x=1#top')).toBe('/cart?x=1#top');
    });

    it('adds the context query to a bare path', () => {
        expect(bindAuthContext('/cart', 'v1')).toBe(`/cart?${AUTH_CONTEXT_QUERY}=v1`);
    });

    it('preserves existing params and replaces a stale context value', () => {
        expect(bindAuthContext(`/cart?x=1&${AUTH_CONTEXT_QUERY}=old`, 'v2')).toBe(`/cart?x=1&${AUTH_CONTEXT_QUERY}=v2`);
    });

    it('keeps the whole fragment, including later # characters', () => {
        expect(bindAuthContext('/p?x=1#a#b', 'v1')).toBe(`/p?x=1&${AUTH_CONTEXT_QUERY}=v1#a#b`);
    });
});
