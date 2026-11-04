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
import type { AuditResult } from '../types';
import { FindingsTable } from '../components/FindingsTable';

export function AllFindings({ result, initialOutcome }: { result: AuditResult; initialOutcome?: string }) {
    return (
        <div className="audit-stack">
            <FindingsTable
                result={result}
                heading="All findings"
                evaluations={result.evaluations}
                observations={result.observations}
                showCategoryFilter
                initialOutcome={initialOutcome}
            />
        </div>
    );
}
