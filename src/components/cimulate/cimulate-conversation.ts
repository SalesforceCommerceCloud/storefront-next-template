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

/** Deployment-scoped storage keys the Commerce Client SDK uses for conversation state. */
export interface CimulateConversationStorageKeys {
    conversationTokenKey: string;
    conversationIdKey: string;
}

export function buildConversationStorageKeys(
    salesforceOrgId: string,
    esDeveloperName: string
): CimulateConversationStorageKeys {
    return {
        conversationTokenKey: `cim_af_ct_${salesforceOrgId}_${esDeveloperName}`,
        conversationIdKey: `cim_af_conv_${salesforceOrgId}_${esDeveloperName}`,
    };
}

/** Reads `store[key]` as JSON and returns `field` if it is a non-blank string. Never throws. */
function readStoredJsonString(store: () => Storage, key: string, field: string): string | undefined {
    try {
        const raw = store().getItem(key);
        if (!raw) return undefined;
        const value: unknown = (JSON.parse(raw) as Record<string, unknown> | null)?.[field];
        return typeof value === 'string' && value.trim() !== '' ? value : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Reads the widget's conversation id (`{"conversationId":"...","storedAt":...}`). The widget keeps it in
 * `localStorage` (1.34.0+); older builds used `sessionStorage`, so that is the fallback. SSR-safe.
 */
export function readCimulateConversationId(key: string): string | undefined {
    if (typeof window === 'undefined') return undefined;
    return (
        readStoredJsonString(() => window.localStorage, key, 'conversationId') ??
        readStoredJsonString(() => window.sessionStorage, key, 'conversationId')
    );
}

/**
 * Reads the widget's conversation token (`{"accessToken":"..."}`) from `sessionStorage`, then `localStorage`.
 * A store whose value equals `excludedValue` is skipped, so a stale copy in one store cannot hide a newer
 * token in the other. SSR-safe.
 */
export function readCimulateConversationToken(key: string, excludedValue?: string): string | undefined {
    if (typeof window === 'undefined') return undefined;
    for (const store of [() => window.sessionStorage, () => window.localStorage]) {
        const token = readStoredJsonString(store, key, 'accessToken');
        if (token !== undefined && token !== excludedValue) return token;
    }
    return undefined;
}

export interface ConversationRotationPollOptions {
    generation?: number;
    maxChecks?: number;
    initialDelayMs?: number;
    capMs?: number;
    sleepImpl?: (ms: number) => Promise<void>;
}

const DEFAULT_MAX_CHECKS = 8;
const DEFAULT_INITIAL_DELAY_MS = 100;
const DEFAULT_CAP_MS = 1000;

function defaultSleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Polls `tokenKey` for a Commerce Client conversation token that differs from `excludedValue`
 * (the previous conversation's token), so a new conversation never links using a stale JWT.
 * Bounded: 8 checks, 100ms initial delay doubling up to a 1s cap, no sleep after the last check.
 * Resolves with the rotated value, or `undefined` if the bound is exhausted without a change.
 */
export async function waitForRotatedConversationToken(
    tokenKey: string,
    excludedValue: string | undefined,
    options: ConversationRotationPollOptions = {}
): Promise<string | undefined> {
    const {
        maxChecks = DEFAULT_MAX_CHECKS,
        initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
        capMs = DEFAULT_CAP_MS,
        sleepImpl = defaultSleep,
        generation,
    } = options;

    let delay = initialDelayMs;
    for (let check = 1; check <= maxChecks; check++) {
        if (generation !== undefined && !isCurrentCimulateLinkGeneration(generation)) return undefined;
        const current = readCimulateConversationToken(tokenKey, excludedValue);
        if (current !== undefined) return current;
        if (check === maxChecks) break;
        await (generation === undefined
            ? sleepImpl(Math.min(delay, capMs))
            : waitForCimulateLinkDelay(Math.min(delay, capMs), generation));
        delay = Math.min(delay * 2, capMs);
    }
    return undefined;
}

export type CimulateUserType = 'guest' | 'registered';

/** Non-sensitive identity snapshot used only to detect login/logout/account-switch/guest-rotation. */
export interface CimulateIdentitySnapshot {
    siteId: string;
    userType: CimulateUserType;
    usid?: string;
    customerId?: string;
}

export function buildCimulateIdentityKey({ siteId, userType, usid, customerId }: CimulateIdentitySnapshot): string {
    const subject = userType === 'registered' ? customerId : usid;
    return `${siteId}:${userType}:${subject ?? ''}`;
}

export type CimulateIdentityChangeKind = 'login' | 'logout' | 'account-switch' | 'guest-rotation' | 'none';

/** Classifies a shopper-identity transition. `previous` undefined (not yet established) is never a change. */
export function classifyCimulateIdentityChange(
    previous: CimulateIdentitySnapshot | undefined,
    next: CimulateIdentitySnapshot
): CimulateIdentityChangeKind {
    if (!previous || previous.siteId !== next.siteId) return 'none';

    if (previous.userType === next.userType) {
        if (next.userType === 'registered') {
            return previous.customerId !== next.customerId ? 'account-switch' : 'none';
        }
        return previous.usid !== next.usid ? 'guest-rotation' : 'none';
    }

    return previous.userType === 'guest' ? 'login' : 'logout';
}

export function buildCimulateComboKey(
    salesforceOrgId: string,
    esDeveloperName: string,
    siteId: string,
    conversationId: string | undefined,
    identityKey: string
): string {
    return `${salesforceOrgId}:${esDeveloperName}:${siteId}:${conversationId ?? 'unknown'}:${identityKey}`;
}

// Module-level so lifecycle state survives `CimulateWindow` remounts (lazy chunk, route-level unmounts).
let generationCounter = 0;
let queueTail: Promise<unknown> = Promise.resolve();
let lastLinkedCombo: string | undefined;
let lastAttemptedToken: string | undefined;
let lastLinkedToken: string | undefined;
let previousIdentity: CimulateIdentitySnapshot | undefined;
let initialEvaluationClaimed = false;
let pendingRotation: { excludedToken?: string } | undefined;
const cancelLinkWaits = new Set<() => void>();

export function requireCimulateTokenRotation(excludedToken: string | undefined, replace = false): void {
    if (replace || !pendingRotation) pendingRotation = { excludedToken };
}

export function getPendingCimulateTokenRotation(): typeof pendingRotation {
    return pendingRotation;
}

export function consumeCimulateTokenRotation(record: typeof pendingRotation, generation: number): void {
    if (isCurrentCimulateLinkGeneration(generation) && pendingRotation === record) pendingRotation = undefined;
}

/** Supersession cancels only local delays, never an active SDK or network request. */
export function waitForCimulateLinkDelay(ms: number, generation: number): Promise<void> {
    if (!isCurrentCimulateLinkGeneration(generation)) return Promise.resolve();
    return new Promise((resolve) => {
        const finish = (): void => {
            clearTimeout(timer);
            cancelLinkWaits.delete(finish);
            resolve();
        };
        const timer = setTimeout(finish, ms);
        cancelLinkWaits.add(finish);
    });
}

/** Call once per identity-lifecycle event (ready, re-link, logout) to get a generation to guard with. */
export function nextCimulateLinkGeneration(): number {
    generationCounter += 1;
    for (const cancel of cancelLinkWaits) cancel();
    return generationCounter;
}

/** True if `generation` is still the most recent one issued — guards stale async work from applying. */
export function isCurrentCimulateLinkGeneration(generation: number): boolean {
    return generation === generationCounter;
}

/**
 * Serializes all link work (ready, resume, login/logout/account-switch) so the newest identity's
 * Token Bridge call always runs after any older one already in flight, never interleaved.
 */
export function enqueueCimulateLinkWork<T>(work: () => Promise<T>): Promise<T> {
    const result = queueTail.then(work, work);
    queueTail = result.then(
        () => undefined,
        () => undefined
    );
    return result;
}

/** Dedup remembers only the most recent successful link; a different (conversation, identity) always re-links. */
export function hasCimulateComboLinked(key: string): boolean {
    return lastLinkedCombo === key;
}

export function markCimulateComboLinked(key: string): void {
    lastLinkedCombo = key;
}

/** Forget the last link, e.g. after the conversation it belonged to has been ended. */
export function clearCimulateLinkedCombo(): void {
    lastLinkedCombo = undefined;
}

/** Token of the latest link attempt (falling back to the last linked one) that a new-conversation link must differ from. */
export function getExcludedCimulateToken(): string | undefined {
    return lastAttemptedToken ?? lastLinkedToken;
}

/** Token of the latest link attempt; the next new-conversation link must wait for a different one. */
export function getLastAttemptedCimulateToken(): string | undefined {
    return lastAttemptedToken;
}

export function setLastAttemptedCimulateToken(token: string | undefined): void {
    lastAttemptedToken = token;
}

export function setLastLinkedCimulateToken(token: string | undefined): void {
    lastLinkedToken = token;
}

/** Last observed shopper identity — the baseline for classifying the next change. */
export function getPreviousCimulateIdentity(): CimulateIdentitySnapshot | undefined {
    return previousIdentity;
}

export function setPreviousCimulateIdentity(identity: CimulateIdentitySnapshot): void {
    previousIdentity = identity;
}

/** True exactly once per page load: the caller is the first to evaluate whether a conversation is being resumed. */
export function claimInitialCimulateEvaluation(): boolean {
    if (initialEvaluationClaimed) return false;
    initialEvaluationClaimed = true;
    return true;
}

/** Test-only: restore all module-level lifecycle state. */
export function __resetCimulateLifecycleForTests(): void {
    for (const cancel of cancelLinkWaits) cancel();
    pendingRotation = undefined;
    generationCounter = 0;
    queueTail = Promise.resolve();
    lastLinkedCombo = undefined;
    lastAttemptedToken = undefined;
    lastLinkedToken = undefined;
    previousIdentity = undefined;
    initialEvaluationClaimed = false;
}
