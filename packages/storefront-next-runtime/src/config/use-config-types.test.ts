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
 * Baseline type-level tests for the SDK's `useConfig()` narrow.
 *
 * These run against the unaugmented SDK shape (no template `declare module`).
 * `ClientFacingAppConfig` is a conditional type:
 *   - When `ClientFacingAppConfigShape` is empty (today's bare-SDK state), it
 *     resolves to `AppConfigShape` — bare-SDK callers retain today's wide-read
 *     behavior. Zero-breakage upgrade.
 *   - When a template fills `ClientFacingAppConfigShape` (typically with
 *     `Omit<AppConfig, 'serverExtension'>`), it resolves to that augmented shape
 *     — the narrow.
 *
 * The augmented case is covered by `packages/template/src/types/config-narrow.test.ts`,
 * which is where the `@ts-expect-error` proof of the actual narrow lives.
 *
 * Module-augmentation is intentionally NOT used here — augmentations are
 * program-wide and would leak into every other test in this package.
 *
 * Run under `pnpm typecheck`, not `pnpm test`. The `expectTypeOf` call is a
 * compile-time check — vitest's runtime pass executes the test body but doesn't
 * enforce type assertions, so a regression surfaces in tsc, not in the test
 * runner. CI gates on the typecheck step.
 */
import { describe, it, expectTypeOf } from 'vitest';
import type { ClientFacingAppConfigShape } from './get-config';

describe('useConfig() — SDK baseline (no template augmentation)', () => {
    it('default ClientFacingAppConfigShape has no keys', () => {
        // Without a template filling the slot, `keyof ClientFacingAppConfigShape` is `never`,
        // so `ClientFacingAppConfig` falls back to `AppConfigShape` and `useConfig()` returns
        // today's wide shape unchanged.
        expectTypeOf<keyof ClientFacingAppConfigShape>().toEqualTypeOf<never>();
    });
});
