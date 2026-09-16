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
import { describe, expect, it, vi } from 'vitest';
import type { RouterContextProvider } from 'react-router';
import { getAppOrigin } from '@/lib/origin';
import { buildSeoPageUrl } from './page-url.server';

vi.mock('@/lib/origin', () => ({ getAppOrigin: vi.fn() }));

const context = {} as Readonly<RouterContextProvider>;

describe('buildSeoPageUrl', () => {
    it('builds the page URL on the public app origin, not the request origin', () => {
        // The request arrives on the internal serverless origin on MRT; the crawler-visible
        // URL must use the public origin resolved from the forwarded host instead.
        vi.mocked(getAppOrigin).mockReturnValue('https://www.example.com');
        const requestUrl = new URL('https://internal-lambda-url.aws/category/mens');

        expect(buildSeoPageUrl(context, requestUrl)).toBe('https://www.example.com/category/mens');
    });

    it('strips tracking params, keeps content params sorted, and drops the trailing slash', () => {
        vi.mocked(getAppOrigin).mockReturnValue('https://www.example.com');
        const requestUrl = new URL('https://www.example.com/category/mens/?utm_source=news&sort=price&q=jacket');

        expect(buildSeoPageUrl(context, requestUrl)).toBe('https://www.example.com/category/mens?q=jacket&sort=price');
    });
});
