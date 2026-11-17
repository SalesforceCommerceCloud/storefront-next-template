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

import { describe, expect, it } from 'vitest';

import { RELEASE_SEMVER, compareSemver, resolveStatus } from './spec-version.ts';

describe('compareSemver', () => {
    it('orders by major, then minor, then patch', () => {
        expect(compareSemver('2.0.0', '1.9.9')).toBeGreaterThan(0);
        expect(compareSemver('1.2.0', '1.1.9')).toBeGreaterThan(0);
        expect(compareSemver('1.1.2', '1.1.1')).toBeGreaterThan(0);
        expect(compareSemver('1.1.1', '1.1.1')).toBe(0);
        expect(compareSemver('1.0.0', '2.0.0')).toBeLessThan(0);
    });
});

describe('RELEASE_SEMVER', () => {
    it.each(['1.5.2', '0.0.0', '10.20.30'])('accepts %s', (version) => {
        expect(RELEASE_SEMVER.test(version)).toBe(true);
    });

    it.each([
        '1.50',
        '1.5',
        '1.2.0-master-b68',
        '1.1.0-PR-44-b5',
        'v1.2.3',
        '1.019',
        '01.2.3',
    ])('rejects %s', (version) => {
        expect(RELEASE_SEMVER.test(version)).toBe(false);
    });
});

describe('resolveStatus', () => {
    it('reports outdated when ECOM publishes a newer version', () => {
        expect(resolveStatus('1.5.2', '1.5.0')).toBe('outdated');
    });

    it('reports up-to-date when the versions match', () => {
        expect(resolveStatus('1.5.2', '1.5.2')).toBe('up-to-date');
    });

    it('reports ahead, not outdated, when the tracked version is newer than ECOM', () => {
        expect(resolveStatus('1.5.0', '1.5.2')).toBe('ahead');
    });

    it('treats a malformed tracked version as outdated, never up-to-date', () => {
        // naive compareSemver('1.5.2', '1.50') parses "1.50" as minor=50 and would
        // (wrongly) rank the tracked version as newer, masking real drift forever.
        expect(compareSemver('1.5.2', '1.50')).toBeLessThan(0);
        expect(resolveStatus('1.5.2', '1.50')).toBe('outdated');
    });
});
