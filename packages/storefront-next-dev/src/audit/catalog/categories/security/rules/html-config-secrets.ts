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
import { z } from 'zod';
import type { PreparedRuleResult, RulePreparationFunction } from '../../../../preparation';
import { measurePage } from '../../../../rule-helpers/document-size';

export const dataSchema = z
    .object({
        pages: z.array(
            z
                .object({
                    page: z.string(),
                    url: z.string(),
                    appConfig: z.array(z.string()),
                    pageData: z.array(z.string()),
                    other: z.array(z.string()),
                })
                .strict()
        ),
        skipped: z.array(z.object({ page: z.string(), reason: z.string() }).strict()),
    })
    .strict();
type Data = z.infer<typeof dataSchema>;

/** Lists the inline scripts archived from each page's HTML for the agent to review; secrets can't be recognized by a script, so this never decides. */
const listInlineScripts: RulePreparationFunction<Data> = async ({
    pages,
    playhouse,
}): Promise<PreparedRuleResult<Data>> => {
    const data: Data = { pages: [], skipped: [] };
    for (const page of pages) {
        const size = await measurePage(playhouse, page.label);
        if ('reason' in size) data.skipped.push({ page: page.label, reason: size.reason });
        else if (size.markupBytes === null)
            data.skipped.push({ page: page.label, reason: 'Playhouse archived no inline scripts for this page.' });
        else data.pages.push({ page: page.label, url: size.url, ...size.scripts });
    }
    return { data };
};
export default listInlineScripts;
