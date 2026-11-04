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
import { harEntry, network, PAGE_URL, runRule } from '../../../../__fixtures__/archive';
import contentSecurityPolicy, { dataSchema } from './content-security-policy';

const page = (headers: Record<string, string>) => ({
    home: network([harEntry(PAGE_URL, { headers, mimeType: 'text/html' })]),
});
const reasons = async (headers: Record<string, string>) =>
    dataSchema.parse((await runRule(contentSecurityPolicy, page(headers))).data).failures[0]?.reasons ?? [];

describe('security/content-security-policy', () => {
    it('passes a policy that restricts scripts, framing and forms', async () => {
        const result = await runRule(
            contentSecurityPolicy,
            page({ 'Content-Security-Policy': "script-src 'self'; frame-ancestors 'none'; form-action 'self'" })
        );
        expect(result.decision?.status).toBe('pass');
    });

    it('fails a missing or report-only policy', async () => {
        expect(await reasons({})).toEqual(['Content-Security-Policy is missing.']);
        expect(await reasons({ 'Content-Security-Policy-Report-Only': "default-src 'self'" })).toEqual([
            'Content-Security-Policy is report-only.',
        ]);
    });

    it('fails unsafe-eval, unrestricted scripts and missing directives', async () => {
        expect(await reasons({ 'Content-Security-Policy': "default-src * 'unsafe-eval'; ;" })).toEqual([
            "CSP allows 'unsafe-eval'.",
            'CSP does not restrict scripts: script-src (or default-src without script-src) is missing or allows *.',
            'CSP frame-ancestors is missing.',
            'CSP form-action is missing.',
        ]);
        // Every enforced policy applies, so a second policy can add the missing restrictions.
        expect(
            await reasons({
                'Content-Security-Policy':
                    "img-src 'self', default-src 'self'; frame-ancestors 'none'; form-action 'self'",
            })
        ).toEqual([]);
    });
});
