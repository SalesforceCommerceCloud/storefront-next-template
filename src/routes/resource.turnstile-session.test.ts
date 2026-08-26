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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loader } from './resource.turnstile-session';
import type { AppConfig } from '@/types/config';

vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    getConfig: vi.fn(),
}));
vi.mock('@/lib/cookie-utils.server', () => ({
    getCookieNameWithSiteId: vi.fn((name: string) => `${name}_TestSite`),
}));
vi.mock('@/lib/turnstile/cookie-match.server', () => ({
    isTurnstileSessionVerifiedForEmail: vi.fn(),
}));
vi.mock('@/lib/turnstile/utils', () => ({
    getTurnstileSiteKey: vi.fn(),
    isTurnstileEnabled: vi.fn(),
}));
vi.mock('@/lib/turnstile/enforce.server', () => ({
    resolveVerificationMode: vi.fn(() => 'enforce'),
}));

const ENABLED_CONFIG = {
    security: { turnstile: { enabled: true, verification: { enabled: true } } },
} as unknown as AppConfig;

describe('resource.turnstile-session loader', () => {
    let mockGetConfig: ReturnType<typeof vi.fn>;
    let mockIsTurnstileEnabled: ReturnType<typeof vi.fn>;
    let mockGetTurnstileSiteKey: ReturnType<typeof vi.fn>;
    let mockIsVerified: ReturnType<typeof vi.fn>;
    let mockResolveMode: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        vi.clearAllMocks();
        mockGetConfig = vi.mocked((await import('@salesforce/storefront-next-runtime/config')).getConfig);
        mockIsTurnstileEnabled = vi.mocked((await import('@/lib/turnstile/utils')).isTurnstileEnabled);
        mockGetTurnstileSiteKey = vi.mocked((await import('@/lib/turnstile/utils')).getTurnstileSiteKey);
        mockIsVerified = vi.mocked(
            (await import('@/lib/turnstile/cookie-match.server')).isTurnstileSessionVerifiedForEmail
        );
        mockResolveMode = vi.mocked((await import('@/lib/turnstile/enforce.server')).resolveVerificationMode);

        mockGetConfig.mockReturnValue(ENABLED_CONFIG);
        mockIsTurnstileEnabled.mockReturnValue(true);
        mockResolveMode.mockReturnValue('enforce');
        mockGetTurnstileSiteKey.mockReturnValue('1x00000000000000000000AA');
        mockIsVerified.mockReturnValue(false);
    });

    function makeArgs(url: string, cookie?: string) {
        return {
            request: new Request(url, cookie ? { headers: { cookie } } : undefined),
            context: {} as never,
            params: {},
        };
    }

    it('returns verified: false when Turnstile is disabled', () => {
        mockIsTurnstileEnabled.mockReturnValue(false);
        const result = loader(makeArgs('https://store.example.com/resource/turnstile-session?email=a%40b.c') as never);
        expect(result).toEqual({ verified: false });
        expect(mockIsVerified).not.toHaveBeenCalled();
    });

    it('returns verified: false when email query param is missing', () => {
        const result = loader(makeArgs('https://store.example.com/resource/turnstile-session') as never);
        expect(result).toEqual({ verified: false });
        expect(mockIsVerified).not.toHaveBeenCalled();
    });

    it('returns helper result when cookie matches (no directory side effects)', () => {
        mockIsVerified.mockReturnValue(true);
        const result = loader(
            makeArgs(
                'https://store.example.com/resource/turnstile-session?email=shopper%40example.com',
                'cc-tv=x'
            ) as never
        );
        expect(result).toEqual({ verified: true });
        expect(mockIsVerified).toHaveBeenCalledWith(
            expect.objectContaining({
                email: 'shopper@example.com',
                siteKey: '1x00000000000000000000AA',
                turnstileCookieName: 'cc-tv_TestSite',
            })
        );
    });

    it('returns verified: false when helper says no match', () => {
        mockIsVerified.mockReturnValue(false);
        const result = loader(makeArgs('https://store.example.com/resource/turnstile-session?email=a%40b.c') as never);
        expect(result).toEqual({ verified: false });
    });
});
