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
import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { expect, test } from 'vitest';
import { useSeoUrlContext } from '@/hooks/use-seo-url-context';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { mockConfig, mockSiteObject } from '@/test-utils/config';
import type { AppConfig } from '@/types/config';

test('binds URL generation to the active site and client configuration', () => {
    const seoRoutes = {
        [mockSiteObject.id]: {
            product: { prefix: 'p' },
            category: { prefix: 'c', mode: 'id-suffix' as const },
        },
    };
    const config: AppConfig = { ...mockConfig, url: { ...mockConfig.url, seoRoutes } };
    const Wrapper = ({ children }: { children: ReactNode }) => (
        <AllProvidersWrapper config={config}>{children}</AllProvidersWrapper>
    );

    const { result } = renderHook(() => useSeoUrlContext(), { wrapper: Wrapper });

    expect(result.current).toEqual({
        siteId: mockSiteObject.id,
        urlPrefix: '/:siteId/:localeId',
        seoRoutes,
    });
});
