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
import { appConfigScript, htmlPage, pageDataScript, PAGE_URL, runRule } from '../../../../__fixtures__/archive';
import htmlConfigSecrets, { dataSchema } from './html-config-secrets';

describe('security/html-config-secrets', () => {
    it('lists the inline scripts for review and never decides', async () => {
        const result = await runRule(htmlConfigSecrets, {
            home: htmlPage({ htmlBytes: 50_000, scripts: [appConfigScript('{}'), pageDataScript(10), 'a();'] }),
            plp: htmlPage({ htmlBytes: 50_000 }),
            pdp: {},
        });
        expect(result.decision).toBeUndefined();
        expect(dataSchema.parse(result.data)).toEqual({
            pages: [
                {
                    page: 'home',
                    url: PAGE_URL,
                    appConfig: ['scripts/s0.js'],
                    pageData: ['scripts/s1.js'],
                    other: ['scripts/s2.js'],
                },
            ],
            skipped: [
                { page: 'plp', reason: 'Playhouse archived no inline scripts for this page.' },
                { page: 'pdp', reason: 'The HAR or final document identity was unavailable.' },
            ],
        });
    });
});
