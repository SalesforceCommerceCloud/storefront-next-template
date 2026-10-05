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
import type { ShouldRevalidateFunctionArgs } from 'react-router';
import { resourceRoutes, routes } from '@/route-paths';
import { shouldRevalidate } from './content';

function args(overrides: Partial<ShouldRevalidateFunctionArgs> = {}): ShouldRevalidateFunctionArgs {
    return {
        currentUrl: new URL('https://shop.example/RefArch/en-US/cms/page/landing'),
        currentParams: {},
        nextUrl: new URL('https://shop.example/RefArch/en-US/cms/page/landing'),
        nextParams: {},
        defaultShouldRevalidate: false,
        actionStatus: undefined,
        actionResult: undefined,
        formAction: undefined,
        formMethod: undefined,
        formEncType: undefined,
        formData: undefined,
        json: undefined,
        text: undefined,
        ...overrides,
    };
}

describe('content shouldRevalidate', () => {
    it('skips unrelated action submissions', () => {
        expect(
            shouldRevalidate(
                args({ formMethod: 'POST', formAction: resourceRoutes.cartItemAdd, defaultShouldRevalidate: true })
            )
        ).toBe(false);
    });

    it.each([
        resourceRoutes.setSiteContext,
        resourceRoutes.updateShopperContext,
        routes.login,
        routes.logout,
    ])('revalidates for ambient mutation %s', (formAction) => {
        expect(shouldRevalidate(args({ formMethod: 'POST', formAction }))).toBe(true);
    });

    it('revalidates when navigating to another content path', () => {
        expect(
            shouldRevalidate(args({ nextUrl: new URL('https://shop.example/RefArch/en-US/cms/content/company/about') }))
        ).toBe(true);
    });

    it('defers same-path navigation and explicit revalidation to React Router', () => {
        expect(shouldRevalidate(args({ defaultShouldRevalidate: false }))).toBe(false);
        expect(shouldRevalidate(args({ defaultShouldRevalidate: true }))).toBe(true);
    });
});
