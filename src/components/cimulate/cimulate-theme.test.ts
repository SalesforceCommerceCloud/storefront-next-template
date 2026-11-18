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
import { resolveWidgetTheme, type CommerceClientTheme } from './cimulate-theme';

describe('resolveWidgetTheme', () => {
    it('defaults to the widget Commerce recipe without host color overrides', () => {
        expect(resolveWidgetTheme()).toEqual({ preset: 'commerce' });
    });

    it.each<CommerceClientTheme>([
        {},
        { primaryColor: '#123456', borderRadius: 0 },
        { preset: 'legacy' },
        {
            preset: 'commerce',
            density: 'compact',
            shape: 'soft',
            elevation: 'flat',
            tokens: { cardRadius: 0, primary: '#123456' },
        },
    ])('preserves explicit recipes and flat compatibility objects: %j', (theme) => {
        expect(resolveWidgetTheme(theme)).toBe(theme);
    });

    it('ignores malformed non-object configuration', () => {
        expect(resolveWidgetTheme('commerce' as unknown as CommerceClientTheme)).toEqual({ preset: 'commerce' });
    });
});
