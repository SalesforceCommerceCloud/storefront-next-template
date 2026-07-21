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
import type { TFunction } from 'i18next';
import { getShippingArrivalLabel } from './shipping-arrival-label';

// Records each call so we can assert which i18n key/interpolation was used.
const makeT = () => {
    const calls: Array<{ key: string; opts: Record<string, unknown> }> = [];
    const t = ((key: string, opts?: Record<string, unknown>) => {
        calls.push({ key, opts: opts ?? {} });
        return `${key}:${JSON.stringify(opts ?? {})}`;
    }) as unknown as TFunction<'checkout'>;
    return { t, calls };
};

describe('getShippingArrivalLabel', () => {
    it('prefers a formatted deliveryWindow over estimatedArrivalTime', () => {
        const { t, calls } = makeT();
        const label = getShippingArrivalLabel(
            {
                deliveryWindow: { startAt: '2026-04-30T12:00:00Z', endAt: '2026-05-07T12:00:00Z' },
                estimatedArrivalTime: '2-3 business days',
            },
            t,
            'en-US'
        );
        expect(calls).toHaveLength(1);
        expect(calls[0].key).toBe('shippingOptions.deliveryWindow');
        expect(calls[0].opts.window).toContain('Apr 30');
        expect(calls[0].opts.window).toContain('May 7');
        expect(label).toContain('shippingOptions.deliveryWindow');
    });

    it('falls back to estimatedArrivalTime when deliveryWindow is absent', () => {
        const { t, calls } = makeT();
        const label = getShippingArrivalLabel({ estimatedArrivalTime: 'Dec 15-17' }, t, 'en-US');
        expect(calls).toHaveLength(1);
        expect(calls[0].key).toBe('shippingOptions.arrives');
        expect(calls[0].opts.estimatedArrivalTime).toBe('Dec 15-17');
        expect(label).toContain('shippingOptions.arrives');
    });

    it('falls back to estimatedArrivalTime when deliveryWindow is present but unformattable', () => {
        const { t, calls } = makeT();
        getShippingArrivalLabel(
            {
                deliveryWindow: { startAt: 'not-a-date', endAt: 'also-bad' },
                estimatedArrivalTime: '2-3 business days',
            },
            t,
            'en-US'
        );
        expect(calls[0].key).toBe('shippingOptions.arrives');
    });

    it('returns undefined when neither source is present', () => {
        const { t, calls } = makeT();
        expect(getShippingArrivalLabel({}, t, 'en-US')).toBeUndefined();
        expect(calls).toHaveLength(0);
    });
});
