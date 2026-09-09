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

import { describe, it, expect, vi } from 'vitest';
import type { RouterContextProvider } from 'react-router';
import { getLoginPreferencesLazy } from '@salesforce/storefront-next-runtime/data-store';
import { getLoginPreferences, LOGIN_PREFERENCES_FALLBACK } from './login-preferences.server';

vi.mock('@salesforce/storefront-next-runtime/data-store', () => ({
    getLoginPreferencesLazy: vi.fn(),
}));

const mockGetLoginPreferencesLazy = vi.mocked(getLoginPreferencesLazy);
const context = {} as RouterContextProvider;

describe('getLoginPreferences (template wrapper)', () => {
    it('resolves to login preferences from the data store', async () => {
        mockGetLoginPreferencesLazy.mockResolvedValue({ emailVerificationEnabled: true });
        await expect(getLoginPreferences(context)).resolves.toEqual({ emailVerificationEnabled: true });
        expect(mockGetLoginPreferencesLazy).toHaveBeenCalledWith(context);
    });

    it('coalesces null (entry missing / data-store unavailable) to empty frozen object', async () => {
        mockGetLoginPreferencesLazy.mockResolvedValue(null);
        // A missing entry must stay `emailVerificationEnabled: undefined`, not `false`. The checkout
        // create-account gate compares `emailVerificationEnabled === false`; coalescing a missing entry to
        // false would wrongly hide the create-account checkbox.
        const result = await getLoginPreferences(context);
        expect(result).toEqual({});
        expect(Object.isFrozen(result)).toBe(true);
    });
});

describe('LOGIN_PREFERENCES_FALLBACK', () => {
    it('has emailVerificationEnabled: false', () => {
        expect(LOGIN_PREFERENCES_FALLBACK).toEqual({ emailVerificationEnabled: false });
    });

    it('is frozen', () => {
        expect(Object.isFrozen(LOGIN_PREFERENCES_FALLBACK)).toBe(true);
    });
});
