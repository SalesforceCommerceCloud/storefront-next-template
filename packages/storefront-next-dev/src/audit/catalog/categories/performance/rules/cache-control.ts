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
    cacheControl,
    header,
    harRule,
    harRuleDataSchema,
    resourceKind,
    sameHostResponses,
    type HarEntry,
} from '../../../../rule-helpers/har';

export const dataSchema = harRuleDataSchema;

const YEAR = 31_536_000;
const HOUR = 3_600;
const DAY = 86_400;

/** A content hash before the extension, e.g. `entry.client-Be9z2OkY.js` or `main.3f2a9c0d.css`; it needs a digit or an uppercase letter so words don't count. */
function fingerprinted(url: string): boolean {
    const hash = /[.-]([A-Za-z0-9_-]{8}|[a-f0-9]{8,})\.(?:m?js|css)$/.exec(new URL(url).pathname)?.[1];
    return hash !== undefined && /[0-9A-Z]/.test(hash);
}

function minimumMaxAge(entry: HarEntry): { seconds: number; label: string } | undefined {
    const kind = resourceKind(entry);
    if (kind === 'js' || kind === 'css')
        return fingerprinted(entry.request.url)
            ? { seconds: YEAR, label: 'a fingerprinted asset' }
            : { seconds: HOUR, label: 'a non-fingerprinted script or stylesheet' };
    if (kind === 'image' || kind === 'font') return { seconds: DAY, label: `a public ${kind}` };
    return undefined;
}

export default harRule(
    'same-host script, stylesheet, image and font responses',
    (match) => {
        const eligible = sameHostResponses(match).flatMap((item) => {
            const minimum = minimumMaxAge(item.entry);
            return minimum ? [{ item, minimum }] : [];
        });
        const failures = eligible.flatMap(({ item, minimum }) => {
            const value = header(item.entry, 'cache-control');
            const directives = cacheControl(item.entry);
            const reasons: string[] = [];
            if (!value) reasons.push('Cache-Control is missing.');
            else {
                for (const directive of ['private', 'no-store'])
                    if (directives.has(directive)) reasons.push(`Cache-Control is ${directive}.`);
                const maxAge = directives.get('max-age');
                if (maxAge === undefined || !/^\d+$/.test(maxAge)) reasons.push('Cache-Control has no valid max-age.');
                else if (Number(maxAge) < minimum.seconds)
                    reasons.push(`max-age=${maxAge} is under ${minimum.seconds} seconds for ${minimum.label}.`);
            }
            return reasons.length ? [{ entry: item, reasons, headers: { 'cache-control': value } }] : [];
        });
        return { responses: eligible.length, failures };
    },
    'have long enough Cache-Control lifetimes'
);
