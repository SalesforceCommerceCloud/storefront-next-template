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
import { cn } from '../lib/cn';
import { share, toneClass, type Tone } from '../lib/tone';

// Lighthouse's own score bands: ≥90 good, ≥50 needs improvement, else poor.
function scoreTone(score: number | undefined): Tone {
    if (score === undefined) return 'info';
    return score >= 90 ? 'pass' : score >= 50 ? 'high' : 'critical';
}

/** Lighthouse performance score as a filled gauge (fill = score / 100). */
export function ScoreRing({
    score,
    size = 'small',
    className,
}: {
    score: number | undefined;
    size?: 'small' | 'large';
    className?: string;
}) {
    return (
        <span
            role="img"
            aria-label={score === undefined ? 'Performance score unavailable' : `Performance score ${score} of 100`}
            className={cn('audit-score', `audit-score_${size}`, toneClass(scoreTone(score)), className)}
            style={share((score ?? 0) / 100)}>
            <span className="audit-score__value">{score ?? '—'}</span>
        </span>
    );
}
