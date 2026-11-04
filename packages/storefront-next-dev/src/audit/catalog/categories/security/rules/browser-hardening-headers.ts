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
import { header, harRule, harRuleDataSchema, tokens } from '../../../../rule-helpers/har';

export const dataSchema = harRuleDataSchema;

const REFERRER_POLICIES = ['no-referrer', 'same-origin', 'strict-origin', 'strict-origin-when-cross-origin'];

export default harRule(
    'HTML page responses',
    ({ document }) => {
        const { entry } = document;
        const headers = {
            'x-content-type-options': header(entry, 'x-content-type-options'),
            'x-frame-options': header(entry, 'x-frame-options'),
            'referrer-policy': header(entry, 'referrer-policy'),
            'permissions-policy': header(entry, 'permissions-policy'),
        };
        const reasons: string[] = [];
        if (headers['x-content-type-options']?.trim().toLowerCase() !== 'nosniff')
            reasons.push('X-Content-Type-Options is not nosniff.');
        const frameAncestors = /(?:^|[;,])\s*frame-ancestors\b/i.test(header(entry, 'content-security-policy') ?? '');
        if (!frameAncestors && !headers['x-frame-options'])
            reasons.push('Neither CSP frame-ancestors nor X-Frame-Options is set.');
        // Browsers apply the last policy they recognize.
        const referrer = tokens(headers['referrer-policy']).at(-1);
        if (!referrer) reasons.push('Referrer-Policy is missing.');
        else if (!REFERRER_POLICIES.includes(referrer))
            reasons.push(`Referrer-Policy ${referrer} discloses more than the baseline allows.`);
        if (!headers['permissions-policy']) reasons.push('Permissions-Policy is missing.');
        return { responses: 1, failures: reasons.length ? [{ entry: document, reasons, headers }] : [] };
    },
    'send nosniff, block framing by other sites, limit the referrer and set a Permissions-Policy'
);
