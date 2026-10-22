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

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isOtelEnabled } from './enabled';

describe('isOtelEnabled', () => {
    const saved = {
        sfnext: process.env.SFNEXT_OTEL_ENABLED,
        mrt: process.env.MRT_DISTRIBUTED_TRACING_ENABLED,
    };

    beforeEach(() => {
        delete process.env.SFNEXT_OTEL_ENABLED;
        delete process.env.MRT_DISTRIBUTED_TRACING_ENABLED;
    });

    afterEach(() => {
        for (const [key, value] of [
            ['SFNEXT_OTEL_ENABLED', saved.sfnext],
            ['MRT_DISTRIBUTED_TRACING_ENABLED', saved.mrt],
        ] as const) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    });

    it('is false when neither flag is set', () => {
        expect(isOtelEnabled()).toBe(false);
    });

    it('is true when SFNEXT_OTEL_ENABLED is "true"', () => {
        process.env.SFNEXT_OTEL_ENABLED = 'true';
        expect(isOtelEnabled()).toBe(true);
    });

    it('is true when MRT_DISTRIBUTED_TRACING_ENABLED is "true"', () => {
        process.env.MRT_DISTRIBUTED_TRACING_ENABLED = 'true';
        expect(isOtelEnabled()).toBe(true);
    });

    it('is false when a flag is set to anything other than "true"', () => {
        process.env.SFNEXT_OTEL_ENABLED = 'false';
        process.env.MRT_DISTRIBUTED_TRACING_ENABLED = '1';
        expect(isOtelEnabled()).toBe(false);
    });
});
