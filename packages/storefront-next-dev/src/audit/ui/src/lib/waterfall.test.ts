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
import { blockingChains, callouts, depths, longestBlockingChain, requestCount } from './waterfall';

type Step = Parameters<typeof depths>[0][number];
const step = (id: string, after: string[] = [], extra: Partial<Step> = {}): Step =>
    ({ id, kind: 'api', label: id, source: { file: 'src/x.ts' }, after, blocking: true, ...extra }) as Step;
const steps = [
    step('auth', [], { kind: 'middleware' }),
    step('product', ['auth']),
    step('inventory', ['product']),
    step('pages', ['product'], { blocking: false }),
    step('streamed-child', ['pages'], { blocking: false }),
    step('render', ['inventory'], { kind: 'render' }),
];

describe('server request waterfall', () => {
    it('places each step one past the deepest step it waits on', () => {
        expect(Object.fromEntries(depths(steps))).toEqual({
            auth: 0,
            product: 1,
            inventory: 2,
            pages: 2,
            'streamed-child': 3,
            render: 3,
        });
    });

    it('skips streamed steps in the longest blocking chain', () => {
        expect(longestBlockingChain(steps)).toEqual(['auth', 'product', 'inventory', 'render']);
    });

    it('finds blocking chains and counts requests', () => {
        expect([...blockingChains(steps)]).toEqual(['inventory']);
        // Waiting on middleware alone is the request pipeline, not a chain.
        expect([...blockingChains([step('auth', [], { kind: 'middleware' }), step('header', ['auth'])])]).toEqual([]);
        expect(requestCount(steps)).toBe(5);
    });

    it('lists blocking chains first in the callouts, then other opportunities', () => {
        const mixed = [
            step('defer-me', ['auth'], { opportunity: 'stream', critical: false }),
            ...steps,
            step('needed', ['product'], { critical: true }),
            step('streamed-chain', ['product'], { blocking: false }),
        ];
        expect(callouts(mixed).map((item) => item.id)).toEqual(['inventory', 'needed', 'defer-me']);
    });
});
