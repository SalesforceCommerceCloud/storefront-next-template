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
 * Type-level tests for `useConfig()` narrow.
 *
 * Verify that the SDK's `ClientFacingAppConfigShape` augmentation slot — filled
 * here from the template's `ClientAppConfig` (= `Omit<AppConfig, ServerOnlyNamespace>`)
 * via `src/types/config.ts` — actually subtracts server-only namespaces from
 * `useConfig()`'s return type. The runtime extractor (`extractClientConfig`) and
 * this type narrow read from the same source const (`SERVER_ONLY_NAMESPACES`),
 * so the only way to lose the guarantee is to remove the SDK augmentation.
 *
 * The load-bearing assertion is the `@ts-expect-error` test below — if the
 * narrow regresses, project tsc reports "Unused @ts-expect-error directive."
 *
 * Run these tests under `pnpm typecheck`, not `pnpm test`. Both the
 * `@ts-expect-error` directive and the `expectTypeOf` calls are compile-time
 * checks — vitest's runtime pass executes the test bodies but doesn't enforce
 * type assertions, so a regression here surfaces in tsc, not in the test
 * runner. CI gates on the typecheck step; if you change the narrow and want to
 * confirm locally, `pnpm typecheck` is the fastest probe.
 *
 * IMPORTANT: tests probe `useConfig()` via a never-invoked dummy component, NOT
 * `ReturnType<typeof useConfig>`. The `ReturnType` form resolves the generic
 * default eagerly — before module augmentations merge — so the augmented
 * `ClientFacingAppConfigShape` is invisible at the type-alias site and tsc would
 * silently see the un-augmented `AppConfigShape`. Calling `useConfig()` inside
 * a component (even one that's never rendered) gives TypeScript a real
 * call-expression site where augmentations have merged.
 */
import { describe, expectTypeOf, it } from 'vitest';
import type { RouterContextProvider } from 'react-router';
import { getConfig, useConfig } from '@salesforce/storefront-next-runtime/config';

// Dummy component — never rendered; only exists so `useConfig()` types correctly
// at a call site that respects React Hooks rules and module-augmentation timing.
function ProbeComponent() {
    const config = useConfig();
    return config;
}
type Config = ReturnType<typeof ProbeComponent>;

describe('useConfig() type narrow', () => {
    it('rejects useConfig().serverExtension at compile time', () => {
        const config = {} as Config;
        // @ts-expect-error - serverExtension is server-only and stripped from useConfig's return type
        void config.serverExtension;
    });

    it('preserves client-safe namespaces', () => {
        expectTypeOf<Config>().toHaveProperty('features');
        expectTypeOf<Config>().toHaveProperty('commerce');
        expectTypeOf<Config>().toHaveProperty('auth');
        // app.extension is the public counterpart to app.serverExtension and must round-trip.
        expectTypeOf<Config>().toHaveProperty('extension');
    });

    it('flows the augmented AppConfig members through the narrow', () => {
        // A property-access test against a known AppConfig leaf — proves the narrow returned
        // the augmented shape (not the bare-SDK fallback) when reaching client modules.
        const config = {} as Config;
        expectTypeOf(config.auth).toEqualTypeOf<{ otpLength: 6 | 8 }>();
    });
});

// `getConfig()` is not a hook — a module-level call expression gives TypeScript
// a real call site where module augmentations have merged. The `ProbeComponent`
// trick used for `useConfig()` isn't needed here.
const getConfigProbe = getConfig();
type GetConfigResult = typeof getConfigProbe;

// Wrapper-shape probe — resolves the maybe-context overload (narrow default).
const getConfigMaybeProbe = getConfig(undefined as Readonly<RouterContextProvider> | undefined);
type GetConfigMaybeResult = typeof getConfigMaybeProbe;

describe('getConfig() no-context type narrow', () => {
    it('rejects getConfig().serverExtension at compile time', () => {
        const config = {} as GetConfigResult;
        // @ts-expect-error - serverExtension is server-only and stripped from getConfig's no-context return type
        void config.serverExtension;
    });

    it('preserves client-safe namespaces', () => {
        expectTypeOf<GetConfigResult>().toHaveProperty('features');
        expectTypeOf<GetConfigResult>().toHaveProperty('commerce');
        expectTypeOf<GetConfigResult>().toHaveProperty('auth');
        expectTypeOf<GetConfigResult>().toHaveProperty('extension');
    });

    it('flows the augmented AppConfig members through the narrow', () => {
        const config = {} as GetConfigResult;
        expectTypeOf(config.auth).toEqualTypeOf<{ otpLength: 6 | 8 }>();
    });
});

describe('getConfig() maybe-context (wrapper-friendly) type narrow', () => {
    it('rejects getConfig(maybe).serverExtension at compile time', () => {
        const config = {} as GetConfigMaybeResult;
        // @ts-expect-error - serverExtension is server-only; narrow holds for the maybe-context overload too
        void config.serverExtension;
    });

    it('preserves client-safe namespaces', () => {
        expectTypeOf<GetConfigMaybeResult>().toHaveProperty('features');
        expectTypeOf<GetConfigMaybeResult>().toHaveProperty('commerce');
        expectTypeOf<GetConfigMaybeResult>().toHaveProperty('auth');
        expectTypeOf<GetConfigMaybeResult>().toHaveProperty('extension');
    });
});
