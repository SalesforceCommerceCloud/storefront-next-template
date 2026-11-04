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
import { categoryId } from '../lib/audit';
import { CategorySummary } from '../components/CategorySummary';
import { FindingsTable } from '../components/FindingsTable';
import { Notice } from '../components/Notice';

export function Category({ result, id }: { result: AuditResult; id: string }) {
    const category = result.catalog.categories.find((item) => item.id === id);
    if (!category) return null;
    const evaluations = result.evaluations.filter((item) => categoryId(item) === id);
    const observations = result.observations.filter((item) => item.category === id);

    return (
        <div className="audit-stack">
            <CategorySummary category={category} evaluations={evaluations} />
            {category.ruleIds.length ? (
                <FindingsTable result={result} evaluations={evaluations} observations={observations} />
            ) : (
                <Notice>No codified rules. This is a visible coverage gap, not a pass.</Notice>
            )}
        </div>
    );
}
