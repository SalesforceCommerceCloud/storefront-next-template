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

import { describe, it, expect, vi } from 'vitest';
import { hasConsent, buildConsentPreferences } from './utils';
import { TrackingConsent } from '@/types/tracking-consent';

describe('hasConsent', () => {
    it('should return false when no consentPreferences are provided (unknown state)', () => {
        expect(hasConsent('analytics', undefined)).toBe(false);
    });

    it('should return false when both consentCategory and consentPreferences are undefined', () => {
        expect(hasConsent(undefined, undefined)).toBe(false);
    });

    it('should return true when no consentCategory is configured on the adapter', () => {
        expect(hasConsent(undefined, ['analytics', 'marketing'])).toBe(true);
    });

    it('should return true when the adapter consentCategory is included in preferences', () => {
        expect(hasConsent('analytics', ['necessary', 'analytics', 'marketing'])).toBe(true);
    });

    it('should return false when the adapter consentCategory is not included in preferences', () => {
        expect(hasConsent('marketing', ['necessary', 'analytics'])).toBe(false);
    });

    it('should return false when consentPreferences is an empty array (declined all)', () => {
        expect(hasConsent('analytics', [])).toBe(false);
    });

    it('should return false when consentPreferences is empty even without a consentCategory configured', () => {
        expect(hasConsent(undefined, [])).toBe(false);
    });

    it('should handle custom consent category strings', () => {
        expect(hasConsent('custom-category', ['custom-category', 'another'])).toBe(true);
        expect(hasConsent('custom-category', ['another'])).toBe(false);
    });
});

describe('buildConsentPreferences', () => {
    const allCategories = ['necessary', 'analytics', 'marketing', 'personalization'];

    describe('when consent system is enabled', () => {
        it('should return all categories when consent is accepted', () => {
            const result = buildConsentPreferences(TrackingConsent.Accepted, allCategories, true);
            expect(result).toEqual(['necessary', 'analytics', 'marketing', 'personalization']);
        });

        it('should return a copy (not the same reference) when consent is accepted', () => {
            const result = buildConsentPreferences(TrackingConsent.Accepted, allCategories, true);
            expect(result).not.toBe(allCategories);
        });

        it('should return an empty array when consent is declined', () => {
            const result = buildConsentPreferences(TrackingConsent.Declined, allCategories, true);
            expect(result).toEqual([]);
        });

        it('should return undefined when consent is not yet determined', () => {
            const result = buildConsentPreferences(undefined, allCategories, true);
            expect(result).toBeUndefined();
        });

        it("should warn and fall back to ['necessary'] when categories are empty and consent is accepted", () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const result = buildConsentPreferences(TrackingConsent.Accepted, [], true);
            expect(result).toEqual(['necessary']);
            expect(warnSpy).toHaveBeenCalledOnce();
            warnSpy.mockRestore();
        });

        it('should handle custom category strings', () => {
            const customCategories = ['essential', 'performance', 'targeting'];
            const result = buildConsentPreferences(TrackingConsent.Accepted, customCategories, true);
            expect(result).toEqual(['essential', 'performance', 'targeting']);
        });
    });

    describe('when consent system is not enabled', () => {
        it('should return all categories when categories are configured', () => {
            const result = buildConsentPreferences(undefined, allCategories, false);
            expect(result).toEqual(['necessary', 'analytics', 'marketing', 'personalization']);
        });

        it('should warn and fall back to necessary when categories are empty', () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const result = buildConsentPreferences(undefined, [], false);
            expect(result).toEqual(['necessary']);
            expect(warnSpy).toHaveBeenCalledOnce();
            warnSpy.mockRestore();
        });

        it('should ignore trackingConsent value when consent system is not enabled', () => {
            const declined = buildConsentPreferences(TrackingConsent.Declined, allCategories, false);
            const accepted = buildConsentPreferences(TrackingConsent.Accepted, allCategories, false);
            const undef = buildConsentPreferences(undefined, allCategories, false);
            expect(declined).toEqual(accepted);
            expect(accepted).toEqual(undef);
        });
    });
});
