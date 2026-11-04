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
import type { AuditResult, Severity } from '../types';
import type { Evaluation } from '../lib/audit';
import { Card, Icon } from '../lib/slds';
import { toneClass } from '../lib/tone';
import { cn } from '../lib/cn';

type Category = AuditResult['catalog']['categories'][number];

const STAT_SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low'];

/** Category header: rule coverage line plus per-severity finding counts. */
export function CategorySummary({
    category,
    evaluations,
    icon = 'category',
}: {
    category: Category;
    evaluations: Evaluation[];
    icon?: string;
}) {
    const findings = evaluations.filter((item) => item.disposition === 'finding');
    const notVerified = evaluations.filter((item) => item.disposition === 'not-verified').length;
    const countOf = (severity: Severity) => findings.filter((item) => item.severity === severity).length;
    const ruleCount = category.ruleIds.length;

    return (
        <Card
            heading={category.title}
            icon={<Icon category="standard" name={icon} size="small" />}
            bodyClassName="slds-card__body_inner">
            <div className="slds-grid slds-wrap slds-grid_vertical-align-center slds-gutters">
                <p className="slds-col slds-size_1-of-1 slds-medium-size_7-of-12 audit-prose">
                    {ruleCount
                        ? `${ruleCount} codified ${ruleCount === 1 ? 'rule' : 'rules'}; ${findings.length} ${findings.length === 1 ? 'finding' : 'findings'}${notVerified ? `, ${notVerified} need${notVerified === 1 ? 's' : ''} a manual review` : ''}.`
                        : 'No codified rules for this category yet — this is a visible coverage gap, not a pass.'}
                </p>
                <ul className="slds-col slds-size_1-of-1 slds-medium-size_5-of-12 slds-grid slds-grid_align-end audit-gap_large">
                    {STAT_SEVERITIES.map((severity) => (
                        <li key={severity}>
                            <div className="slds-text-title">{severity}</div>
                            <div className={cn('slds-text-heading_medium audit-highlight', toneClass(severity))}>
                                {countOf(severity)}
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </Card>
    );
}
