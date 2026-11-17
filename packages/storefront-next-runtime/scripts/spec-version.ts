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

/**
 * Pure version logic for the SCAPI spec updater, split out from update-scapi-specs.ts
 * so it can be unit-tested without network or filesystem access.
 */

// Only MAJOR.MINOR.PATCH with no pre-release/build suffix. See https://semver.org/.
export const RELEASE_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export type SpecStatus = 'up-to-date' | 'outdated' | 'ahead';

/** Compare two clean semver strings. Returns >0 when `a` is newer than `b`. */
export function compareSemver(a: string, b: string): number {
    const [aMaj, aMin, aPat] = a.split('.').map(Number);
    const [bMaj, bMin, bPat] = b.split('.').map(Number);
    if (aMaj !== bMaj) return aMaj - bMaj;
    if (aMin !== bMin) return aMin - bMin;
    return aPat - bPat;
}

/**
 * Decide the update status of one tracked spec against the version ECOM publishes.
 *
 * A malformed tracked version (e.g. a hand-edited "1.50") would make
 * compareSemver parse it as [1, 50, NaN] and silently rank a real "1.5.2"
 * as older, masking genuine drift. Such a version is treated as outdated
 * so the update repairs the data.
 *
 * `ahead` means the tracked version is newer than ECOM's, which happens when
 * `--ref` points at an older ECOM branch.
 */
export function resolveStatus(published: string, trackedVersion: string): SpecStatus {
    if (!RELEASE_SEMVER.test(trackedVersion)) return 'outdated';
    const comparison = compareSemver(published, trackedVersion);
    if (comparison > 0) return 'outdated';
    return comparison < 0 ? 'ahead' : 'up-to-date';
}
