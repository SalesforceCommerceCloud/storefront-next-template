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
import type { TrustedAgentIdentity } from '@/scapi';

export type ActingAgent = {
    agentId: string;
    loginId: string;
    contextVersion: string;
    status: 'active' | 'reauth-required';
    tokenExpiresAt: number;
};

export type TrustedAgentSession = TrustedAgentIdentity & {
    mode: 'active' | 'reauth-required';
    contextVersion: string;
    tokenDigest: string;
    dwsid?: string;
    authGeneration?: string;
    requiresTargetConfirmation?: boolean;
};

/** Incomplete browser authorization only; its age is not a support-session duration. */
export type TrustedAgentTransaction = {
    loginId: string;
    codeVerifier: string;
    redirectUri: string;
    nonce: string;
    contextVersion: string;
    createdAt: number;
    /** Captured from protected request state, never supplied by the browser. */
    expectedPriorContextVersion: string | null;
    renewal?: { usid: string; agentId: string };
    returnUrl?: string;
    popup?: boolean;
    authGeneration?: string;
};

export type TrustedAgentLifecycle =
    | { mode: 'none' }
    | { mode: 'blocked' }
    | { mode: 'ended' }
    | { mode: 'pending'; transaction: TrustedAgentTransaction }
    | { mode: 'active'; session: TrustedAgentSession; accessToken: string }
    | { mode: 'reauth-required'; session: TrustedAgentSession };
