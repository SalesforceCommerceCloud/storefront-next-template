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
import {
    COMPRESSED_ENCODINGS,
    header,
    harRule,
    harRuleDataSchema,
    resourceKind,
    sameHostResponses,
    tokens,
} from '../../../../rule-helpers/har';

export const dataSchema = harRuleDataSchema;

const MIN_BYTES: Partial<Record<ReturnType<typeof resourceKind>, number>> = {
    html: 1024,
    js: 10 * 1024,
    css: 10 * 1024,
};

export default harRule(
    'same-host HTML (1 KiB+), JavaScript and CSS (10 KiB+) responses',
    (match) => {
        const eligible = sameHostResponses(match).filter(({ entry }) => {
            const min = MIN_BYTES[resourceKind(entry)];
            const size = entry.response.content?.size;
            return min !== undefined && typeof size === 'number' && size >= min;
        });
        const failures = eligible.flatMap((item) => {
            const encoding = header(item.entry, 'content-encoding');
            if (tokens(encoding).some((token) => COMPRESSED_ENCODINGS.includes(token))) return [];
            const kind = resourceKind(item.entry).toUpperCase();
            return [
                {
                    entry: item,
                    reasons: [
                        `${kind} response of ${Math.round((item.entry.response.content?.size ?? 0) / 1024)} KiB has no br, gzip or zstd Content-Encoding.`,
                    ],
                    headers: { 'content-type': header(item.entry, 'content-type'), 'content-encoding': encoding },
                },
            ];
        });
        return { responses: eligible.length, failures };
    },
    'are compressed with Brotli, gzip or zstd'
);
