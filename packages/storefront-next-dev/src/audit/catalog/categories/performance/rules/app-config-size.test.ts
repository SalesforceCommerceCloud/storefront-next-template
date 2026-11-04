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
import { appConfigScript, htmlPage, runRule } from '../../../../__fixtures__/archive';
import appConfigSize from './app-config-size';

describe('performance/app-config-size', () => {
    it('passes a small app config and sizes its sections, largest first', async () => {
        const result = await runRule(appConfigSize, {
            home: htmlPage({ htmlBytes: 50_000, scripts: [appConfigScript('{"a":1,"commerce":{"site":"RefArch"}}')] }),
        });
        expect(result.data.pages[0]?.appConfigSections).toEqual({ commerce: 18, a: 1 });
        expect(result.decision?.status).toBe('pass');
        expect(result.decision?.evidence[0]).toMatchObject({ artifact: 'scripts/s0.js' });
    });

    it('leaves sections unknown when the config is not a JSON object', async () => {
        for (const config of ['[1, 2]', '{not json}', 'null']) {
            const result = await runRule(appConfigSize, {
                home: htmlPage({ htmlBytes: 50_000, scripts: [appConfigScript(config)] }),
            });
            expect(result.data.pages[0]?.appConfigSections, config).toBeNull();
        }
    });

    it('leaves an oversized config undecided, and cites the HAR without one', async () => {
        const over = await runRule(appConfigSize, {
            home: htmlPage({ htmlBytes: 50_000, scripts: [appConfigScript(`{"big":"${'x'.repeat(13 * 1024)}"}`)] }),
        });
        expect(over.decision).toBeUndefined();
        const none = await runRule(appConfigSize, { home: htmlPage({ htmlBytes: 50_000, scripts: ['track();'] }) });
        expect(none.decision?.evidence[0]).toMatchObject({ artifact: 'network-mobile-cold.har' });
    });
});
