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
import { redirectToCanonicalPath } from './canonical-redirect.server';

function catchRedirect(url: string): Response | undefined {
    try {
        redirectToCanonicalPath(new URL(url));
        return undefined;
    } catch (thrown) {
        return thrown as Response;
    }
}

describe('redirectToCanonicalPath', () => {
    it('301-redirects a trailing-slash path to the slash-free path', () => {
        const response = catchRedirect('https://www.example.com/product/123/');

        expect(response).toBeInstanceOf(Response);
        expect(response?.status).toBe(301);
        expect(response?.headers.get('Location')).toBe('/product/123');
    });

    it('preserves the query string on redirect', () => {
        const response = catchRedirect('https://www.example.com/category/mens/?sort=price&utm_source=news');

        expect(response?.status).toBe(301);
        expect(response?.headers.get('Location')).toBe('/category/mens?sort=price&utm_source=news');
    });

    it('collapses repeated trailing slashes to a single clean path', () => {
        const response = catchRedirect('https://www.example.com/product/123///');

        expect(response?.headers.get('Location')).toBe('/product/123');
    });

    it('does not redirect a path that already has no trailing slash', () => {
        expect(catchRedirect('https://www.example.com/product/123')).toBeUndefined();
    });

    it('exempts the root path so it cannot loop', () => {
        expect(catchRedirect('https://www.example.com/')).toBeUndefined();
    });
});
