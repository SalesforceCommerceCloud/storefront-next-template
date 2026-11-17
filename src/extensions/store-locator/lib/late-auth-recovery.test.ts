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
import { STORE_RECOVER_COOKIE, getLateAuthRecoveryPhase, startLateAuthRecovery } from './late-auth-recovery';

describe('late auth recovery', () => {
    it('retries once with the flag cookie set, clears it, and ends terminal', async () => {
        let cookieDuringRetry = '';
        const ran = await startLateAuthRecovery(() => {
            cookieDuringRetry = document.cookie;
            expect(getLateAuthRecoveryPhase()).toBe('recovering');
            return Promise.resolve();
        });
        expect(ran).toBe(true);
        expect(cookieDuringRetry).toContain(`${STORE_RECOVER_COOKIE}=1`);
        expect(document.cookie).not.toContain(STORE_RECOVER_COOKIE);
        expect(getLateAuthRecoveryPhase()).toBe('failed');
        expect(await startLateAuthRecovery(() => Promise.resolve())).toBe(false);
    });

    it('spends the single retry when revalidate throws', async () => {
        vi.resetModules();
        const fresh = await import('./late-auth-recovery');
        await expect(fresh.startLateAuthRecovery(() => Promise.reject(new Error('offline')))).rejects.toThrow(
            'offline'
        );
        expect(fresh.getLateAuthRecoveryPhase()).toBe('failed');
        expect(document.cookie).not.toContain(fresh.STORE_RECOVER_COOKIE);
        expect(await fresh.startLateAuthRecovery(() => Promise.resolve())).toBe(false);
    });
});
