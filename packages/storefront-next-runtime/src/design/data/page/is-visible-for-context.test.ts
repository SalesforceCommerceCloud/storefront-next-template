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
import { describe, expect, it, vi } from 'vitest';
import { isVisibleForContext } from './is-visible-for-context';
import { validateRule } from '../validate-rule';
import type { QualifierContext, VisibilityRuleDef } from '../types';

vi.mock('../validate-rule');

const context: { locale: string; qualifiers: QualifierContext } = {
    locale: 'en_US',
    qualifiers: {
        campaignQualifiers: {},
        customerGroups: {},
    },
};

describe('isVisibleForContext', () => {
    it('treats a component without visibility rules as visible', () => {
        expect(isVisibleForContext([], context)).toBe(true);
        expect(validateRule).not.toHaveBeenCalled();
    });

    it('is visible when any rule matches', () => {
        const rules: VisibilityRuleDef[] = [{ activeLocales: ['en_US'] }, { activeLocales: ['fr_FR'] }];
        vi.mocked(validateRule).mockReturnValueOnce(false).mockReturnValueOnce(true);

        expect(isVisibleForContext(rules, context)).toBe(true);
        expect(validateRule).toHaveBeenNthCalledWith(1, rules[0], context.locale, context.qualifiers);
        expect(validateRule).toHaveBeenNthCalledWith(2, rules[1], context.locale, context.qualifiers);
    });

    it('is hidden when no visibility rule matches', () => {
        const rules: VisibilityRuleDef[] = [{ activeLocales: ['fr_FR'] }];
        vi.mocked(validateRule).mockReturnValue(false);

        expect(isVisibleForContext(rules, context)).toBe(false);
    });

    it('forwards the evaluation time to each rule', () => {
        const rules: VisibilityRuleDef[] = [{ activeLocales: null, schedule: { start: '2026-01-01T00:00:00.000Z' } }];
        const timedContext = {
            ...context,
            qualifiers: { ...context.qualifiers, currentTime: Date.parse('2026-01-02T00:00:00.000Z') },
        };
        vi.mocked(validateRule).mockReturnValue(true);

        expect(isVisibleForContext(rules, timedContext)).toBe(true);
        expect(validateRule).toHaveBeenCalledWith(rules[0], timedContext.locale, timedContext.qualifiers);
    });
});
