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

import { buildSitePath } from '../utils/url-utils';

const { I } = inject();

interface SeoRouteResponse {
    body: string;
    canonicalUrl?: string;
    headers: Record<string, string>;
    locationPath?: string;
    requestPath: string;
    requestUrl: string;
    status: number;
}

interface SeoRouteRequestOptions {
    method?: 'GET' | 'HEAD';
    userAgent?: string;
}

function getAttribute(tag: string, name: string): string | undefined {
    return tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1];
}

function getCanonicalUrl(body: string, baseUrl: string): string | undefined {
    const canonicalTag = body.match(/<link\b[^>]*>/gi)?.find((tag) =>
        getAttribute(tag, 'rel')
            ?.split(/\s+/)
            .some((value) => value.toLowerCase() === 'canonical')
    );
    const href = canonicalTag && getAttribute(canonicalTag, 'href');

    return href ? new URL(href, baseUrl).toString() : undefined;
}

class SeoUrlPage {
    sitePath(path: string): string {
        return buildSitePath(path);
    }

    async request(path: string, options: SeoRouteRequestOptions = {}): Promise<SeoRouteResponse> {
        const { method = 'GET', userAgent } = options;
        const baseUrl = process.env.BASE_URL || 'http://localhost:5173';
        const requestPath = this.sitePath(path);
        const url = new URL(requestPath, baseUrl).toString();
        let result!: SeoRouteResponse;

        await I.usePlaywrightTo(`request SEO URL ${requestPath}`, async ({ page }) => {
            const response = await page.request.fetch(url, {
                failOnStatusCode: false,
                headers: userAgent ? { 'user-agent': userAgent } : undefined,
                maxRedirects: 0,
                method,
            });
            const body = method === 'GET' ? await response.text() : '';
            const headers = response.headers();
            const location = headers.location;

            result = {
                body,
                canonicalUrl: getCanonicalUrl(body, url),
                headers,
                locationPath: location ? new URL(location, url).pathname : undefined,
                requestPath,
                requestUrl: url,
                status: response.status(),
            };
        });

        return result;
    }
}

export = new SeoUrlPage();
