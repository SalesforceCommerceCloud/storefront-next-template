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
import { header, harRule, harRuleDataSchema } from '../../../../rule-helpers/har';

export const dataSchema = harRuleDataSchema;

/** Each comma-separated policy as directive → lowercased sources; every enforced policy applies. */
function policies(value: string | null): Map<string, string[]>[] {
    return (value ?? '')
        .split(',')
        .map(
            (policy) =>
                new Map(
                    policy.split(';').flatMap((directive) => {
                        const [name, ...sources] = directive.trim().toLowerCase().split(/\s+/);
                        return name ? [[name, sources] as const] : [];
                    })
                )
        )
        .filter((policy) => policy.size);
}

export default harRule(
    'HTML page responses',
    ({ document }) => {
        const { entry } = document;
        const headers = {
            'content-security-policy': header(entry, 'content-security-policy'),
            'content-security-policy-report-only': header(entry, 'content-security-policy-report-only'),
        };
        const enforced = policies(headers['content-security-policy']);
        const reasons: string[] = [];
        if (!enforced.length)
            reasons.push(
                headers['content-security-policy-report-only']
                    ? 'Content-Security-Policy is report-only.'
                    : 'Content-Security-Policy is missing.'
            );
        else {
            if (enforced.some((policy) => [...policy.values()].some((sources) => sources.includes("'unsafe-eval'"))))
                reasons.push("CSP allows 'unsafe-eval'.");
            const restrictsScripts = enforced.some((policy) => {
                const sources = policy.get('script-src') ?? policy.get('default-src');
                return sources !== undefined && !sources.includes('*');
            });
            if (!restrictsScripts)
                reasons.push(
                    'CSP does not restrict scripts: script-src (or default-src without script-src) is missing or allows *.'
                );
            for (const directive of ['frame-ancestors', 'form-action'])
                if (!enforced.some((policy) => policy.has(directive))) reasons.push(`CSP ${directive} is missing.`);
        }
        return { responses: 1, failures: reasons.length ? [{ entry: document, reasons, headers }] : [] };
    },
    "enforce a Content Security Policy that restricts scripts, framing and form targets and doesn't allow 'unsafe-eval'"
);
