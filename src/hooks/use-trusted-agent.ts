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
import { useSyncExternalStore } from 'react';
import { useAuth } from '@/providers/auth';
import { getAuthRecovery, getServerAuthRecovery, subscribeAuthRecovery } from '@/lib/auth/recovery';

/** Loader-owned identity plus server-reported recovery status. No credentials and no discovery fetch. */
export function useTrustedAgent() {
    const session = useAuth();
    const reported = useSyncExternalStore(subscribeAuthRecovery, getAuthRecovery, getServerAuthRecovery);
    const recovery =
        reported?.contextVersion &&
        session?.authContextVersion &&
        reported.contextVersion !== session.authContextVersion
            ? null
            : reported;
    return {
        isAgent: session?.authMode === 'trusted-agent',
        customerId: session?.customerId,
        agentId: session?.actingAgent?.agentId,
        loginId: session?.actingAgent?.loginId,
        status: recovery ? ('reauth-required' as const) : session?.actingAgent?.status,
        recovery,
    };
}
