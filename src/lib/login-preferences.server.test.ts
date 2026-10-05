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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RouterContextProvider } from 'react-router';
import { getLoginPreferencesLazy } from '@salesforce/storefront-next-runtime/data-store';
import { getLoginPreferences } from './login-preferences.server';

vi.mock('@salesforce/storefront-next-runtime/data-store', () => ({
    getLoginPreferencesLazy: vi.fn(),
}));

const mockGetLoginPreferencesLazy = vi.mocked(getLoginPreferencesLazy);
const context = {} as RouterContextProvider;

describe('getLoginPreferences (template wrapper)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('resolves the lazily-fetched value from the SDK getter', async () => {
        mockGetLoginPreferencesLazy.mockResolvedValue({ emailVerificationEnabled: true });

        await expect(getLoginPreferences(context)).resolves.toEqual({ emailVerificationEnabled: true });
        expect(mockGetLoginPreferencesLazy).toHaveBeenCalledWith(context);
    });

    it('resolves to empty preferences when the lazy getter returns null (entry not published)', async () => {
        mockGetLoginPreferencesLazy.mockResolvedValue(null);

        // A missing entry must stay `emailVerificationEnabled: undefined`, not `false`. The checkout
        // create-account gate compares `emailVerificationEnabled === false`; coalescing a missing entry to
        // `false` would hide the checkbox on sites that never published login-preferences.
        await expect(getLoginPreferences(context)).resolves.toEqual({});
    });
});
