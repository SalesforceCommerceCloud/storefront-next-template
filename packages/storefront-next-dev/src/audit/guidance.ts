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
export const GUIDANCE = ['go', 'go-with-fixes', 'no-go'] as const;
export type Guidance = (typeof GUIDANCE)[number];

/** Launch guidance from the known findings: critical blocks launch, high or medium needs fixes. */
export function guidanceFor(evaluations: readonly { disposition: string; severity?: string }[]): Guidance {
    const severities = new Set(
        evaluations.filter((item) => item.disposition === 'finding').map((item) => item.severity)
    );
    if (severities.has('critical')) return 'no-go';
    return severities.has('high') || severities.has('medium') ? 'go-with-fixes' : 'go';
}
