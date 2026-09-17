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
import { type CspResolutionContext } from '@salesforce/storefront-next-runtime/security';
import { createOpenStreetMapCspContributor } from './openstreetmap';

const ctx = { baseDirectives: {} } as CspResolutionContext;

describe('createOpenStreetMapCspContributor (canonical no-op)', () => {
    it('is inactive and contributes nothing — the OSM tile origin is a luxury overlay concern', () => {
        // The origin must not widen every vertical's CSP, and it can't be gated on
        // `process.env.VERTICAL` (unset in the runtime artifact). The luxury overlay activates it.
        const contributor = createOpenStreetMapCspContributor();
        expect(contributor.id).toBe('openstreetmap-embed');
        expect(contributor.isActive(ctx)).toBe(false);
        expect(contributor.contribute(ctx)).toEqual({});
    });
});
