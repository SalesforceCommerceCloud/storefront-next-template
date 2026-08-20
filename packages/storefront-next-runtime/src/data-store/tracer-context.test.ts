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

import { describe, it, expect } from 'vitest';
import type { RouterContextProvider } from 'react-router';
import type { Tracer } from '@opentelemetry/api';
import { dataStoreTracerContext, getDataStoreTracer } from './tracer-context';

function makeContext(): RouterContextProvider {
    const store = new Map<unknown, unknown>();
    return {
        set: (ctx: unknown, value: unknown) => store.set(ctx, value),
        // Return null when unset, mirroring the null default of dataStoreTracerContext.
        get: (ctx: unknown) => (store.has(ctx) ? store.get(ctx) : null),
    } as unknown as RouterContextProvider;
}

describe('getDataStoreTracer', () => {
    it('returns the injected tracer when context is populated', () => {
        const injected = { startActiveSpan: () => undefined } as unknown as Tracer;
        const context = makeContext();
        context.set(dataStoreTracerContext, injected);

        expect(getDataStoreTracer(context)).toBe(injected);
    });

    it('returns null when nothing has been injected', () => {
        expect(getDataStoreTracer(makeContext())).toBeNull();
    });
});
