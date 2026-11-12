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
 *
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScoreRing } from './ScoreRing';

describe('ScoreRing', () => {
    it('rounds a float artifact to a whole number', () => {
        render(<ScoreRing score={28.000000000000004} />);

        expect(screen.getByText('28')).toBeTruthy();
        expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Performance score 28 of 100');
    });

    it('rounds a fractional score like Lighthouse but keeps its band', () => {
        render(<ScoreRing score={89.6} />);

        expect(screen.getByText('90')).toBeTruthy();
        expect(screen.getByRole('img').className).toContain('audit-tone_high');
    });

    it('keeps a score just under 50 in the poor band even though it rounds to 50', () => {
        render(<ScoreRing score={49.5} />);

        expect(screen.getByText('50')).toBeTruthy();
        expect(screen.getByRole('img').className).toContain('audit-tone_critical');
    });

    it('shows 100 for a score that rounds up to a perfect one', () => {
        render(<ScoreRing score={99.6} />);

        expect(screen.getByText('100')).toBeTruthy();
        expect(screen.getByRole('img').className).toContain('audit-tone_pass');
    });

    it('shows a dash when the score is unavailable', () => {
        render(<ScoreRing score={undefined} />);

        expect(screen.getByText('—')).toBeTruthy();
        expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Performance score unavailable');
    });
});
