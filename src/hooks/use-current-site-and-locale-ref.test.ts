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
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCurrentSiteAndLocaleRef } from './use-current-site-and-locale-ref';

vi.mock('@salesforce/storefront-next-runtime/site-context', () => ({
    useSite: () => ({
        site: { id: 'RefArchGlobal', alias: 'global' },
        locale: { id: 'en-GB' },
        language: 'en-US',
    }),
}));

vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    useConfig: () => ({ localeAliasMap: { 'en-GB': 'uk', 'en-US': 'us' } }),
}));

describe('useCurrentSiteAndLocaleRef', () => {
    it('uses the resolved commerce locale when the translation language differs', () => {
        const { result } = renderHook(() => useCurrentSiteAndLocaleRef());

        expect(result.current).toEqual({ siteRef: 'global', localeRef: 'uk' });
    });
});
