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
import type { CSSProperties } from 'react';
import type { Severity } from '../types';
import type { MetricState } from './playhouse';

/**
 * Every colored surface in the app takes one of these tones. The class binds
 * --audit-tone-* to the matching quartet in tokens.css, so a "high" badge, a
 * "high" dot and a "high" bar segment can never drift apart.
 */
export type Tone = Severity | 'pass';

const STATE_TONE: Record<MetricState, Tone> = { pass: 'pass', warn: 'high', fail: 'critical' };

export const toneClass = (tone: Tone): string => `audit-tone_${tone}`;
export const stateTone = (state: MetricState): Tone => STATE_TONE[state];

/**
 * Data-driven geometry (a bar's share of its track, a ring's fill) is the one
 * thing that can't live in a stylesheet. It is passed as a unitless custom
 * property and turned into a length by app.css — never as a literal style.
 */
export const share = (fraction: number): CSSProperties =>
    ({ '--audit-share': Math.max(0, Math.min(1, fraction)) }) as CSSProperties;

/** Relative weight for flex-grow based segment bars. */
export const weight = (value: number): CSSProperties => ({ '--audit-weight': value }) as CSSProperties;

/** Grid placement for data-driven columns: the track count on a grid, the start line on an item. */
export const gridColumns = (count: number): CSSProperties => ({ '--audit-columns': count }) as CSSProperties;
export const gridColumn = (line: number): CSSProperties => ({ '--audit-column': line }) as CSSProperties;
