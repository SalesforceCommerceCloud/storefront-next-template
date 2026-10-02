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

import { resourceRoutes } from '@/route-paths';
import { advanceStatusRecord, getFinalStatus, getMockTrackingNo, getStatusSteps, isFinalStatus } from './return-status';
import type { CreateReturnInput, ReturnRequest, ReturnStatus } from './types';

export { getFinalStatus, getMockTrackingNo, getStatusSteps, isFinalStatus };

/**
 * The only module screens use to read and save returns. It has two backends behind one API:
 *
 * - `api`: returns live on the order (custom attribute `c_returns`) and are read and written through the storefront's
 *   resource routes, which call the Returns custom API. Visible on every device and in Business Manager.
 * - `browser`: returns live in this browser's `localStorage`. Used while the custom API is not deployed
 *   (`features.returnsCustomApi` is off), and by local development.
 *
 * The backend is chosen by the hook from configuration; callers never see the difference. Every method is async, so
 * the screens did not change when the second backend was added.
 *
 * Concurrency
 * - Browser backend: every mutation is one synchronous read-modify-write block. JavaScript cannot interleave two
 *   calls inside it, so two clicks in one tab never overwrite each other. Each mutation re-reads storage first, so a
 *   change made in another tab is not lost.
 * - API backend: the server re-reads the order inside a transaction, rechecks quantities, and treats a repeated
 *   `clientRequestId` as the same request. Replies are merged by "longest history wins", so a slow, stale reply can
 *   never overwrite a newer status.
 * - `advanceStatus` takes the status the caller saw; a stale double click becomes a no-op instead of skipping a step.
 *
 * React
 * - {@link subscribeToReturns} / {@link getReturnsSnapshot} / {@link getReturnsServerSnapshot} are shaped for
 *   `useSyncExternalStore`. The snapshot object only changes when the data changes, and the server snapshot is one
 *   frozen constant, so React never sees a "new" value on an unchanged store (no render loop) and the first client
 *   render matches the server HTML.
 */

export type ReturnsBackend = 'api' | 'browser';

export const RETURNS_STORAGE_KEY = 'returns:v1';

export interface ReturnsSnapshot {
    /** False on the server, during hydration and until the first load finishes. */
    ready: boolean;
    returns: readonly ReturnRequest[];
}

const SERVER_SNAPSHOT: ReturnsSnapshot = Object.freeze({
    ready: false,
    returns: Object.freeze([]) as readonly ReturnRequest[],
});

const RMA_ATTEMPTS = 10;

/** Backend used by the mutating functions. Set by the first subscriber; `browser` until then. */
let activeBackend: ReturnsBackend = 'browser';
let snapshot: ReturnsSnapshot | null = null;
let lastRaw: string | null = null;
/** Used only when `localStorage` is unavailable (private mode, blocked storage), so the demo still works in-session. */
let memoryRaw: string | null = null;
let storageUnavailable = false;
const listeners = new Set<() => void>();
let storageListenerAttached = false;

/** API backend state. */
let apiSnapshot: ReturnsSnapshot | null = null;
let apiLoad: Promise<void> | null = null;
let apiLoadFailed = false;

// ---------------------------------------------------------------------------------------------------------------
// Browser backend: storage access. Every call is guarded: storage can throw or be absent.
// ---------------------------------------------------------------------------------------------------------------

function readRaw(): string | null {
    if (storageUnavailable) return memoryRaw;
    try {
        return window.localStorage.getItem(RETURNS_STORAGE_KEY);
    } catch {
        storageUnavailable = true;
        return memoryRaw;
    }
}

function writeRaw(raw: string): void {
    try {
        window.localStorage.setItem(RETURNS_STORAGE_KEY, raw);
    } catch {
        // Quota or blocked storage: keep the data in memory so the demo still works for this session.
        storageUnavailable = true;
        memoryRaw = raw;
    }
}

function isReturnRequest(value: unknown): value is ReturnRequest {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Partial<ReturnRequest>;
    return (
        typeof candidate.rmaNo === 'string' &&
        typeof candidate.orderNo === 'string' &&
        typeof candidate.status === 'string' &&
        Array.isArray(candidate.items) &&
        Array.isArray(candidate.history)
    );
}

/** Corrupt or foreign data is dropped instead of crashing the page. */
function parse(raw: string | null): ReturnRequest[] {
    if (!raw) return [];
    try {
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(isReturnRequest) : [];
    } catch {
        return [];
    }
}

/** Re-reads storage and replaces the snapshot only if the stored text changed. Returns true when it changed. */
function refresh(): boolean {
    const raw = readRaw();
    if (snapshot && raw === lastRaw) return false;
    lastRaw = raw;
    snapshot = Object.freeze({ ready: true, returns: Object.freeze(parse(raw)) });
    return true;
}

function notify(): void {
    for (const listener of Array.from(listeners)) listener();
}

function handleStorageEvent(event: StorageEvent): void {
    if (activeBackend !== 'browser') return;
    // `key === null` means the whole storage was cleared.
    if (event.key !== null && event.key !== RETURNS_STORAGE_KEY) return;
    if (refresh()) notify();
}

/** Writes the new list, then publishes it. Called only from inside a browser-backend mutation. */
function commit(next: ReturnRequest[]): void {
    writeRaw(JSON.stringify(next));
    refresh();
    notify();
}

// ---------------------------------------------------------------------------------------------------------------
// API backend
// ---------------------------------------------------------------------------------------------------------------

interface ListResponse {
    returns: ReturnRequest[];
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, { credentials: 'same-origin', ...init });
    if (!response.ok) throw new Error(`Returns request failed with status ${response.status}`);
    return (await response.json()) as T;
}

/** The returns for two replies of the same request: the one with the longer history is the newer. */
function newer(a: ReturnRequest, b: ReturnRequest): ReturnRequest {
    return b.history.length > a.history.length ? b : a;
}

function publishApi(returns: readonly ReturnRequest[], ready: boolean): void {
    const previous = apiSnapshot;
    if (previous && previous.ready === ready && JSON.stringify(previous.returns) === JSON.stringify(returns)) return;
    apiSnapshot = Object.freeze({ ready, returns: Object.freeze([...returns]) });
    notify();
}

/** Loads the shopper's returns from the server. One load at a time; a second caller shares the first. */
function loadApi(): Promise<void> {
    if (apiLoad) return apiLoad;
    apiLoad = requestJson<ListResponse>(resourceRoutes.returns, { headers: { Accept: 'application/json' } })
        .then(({ returns }) => {
            apiLoadFailed = false;
            // A mutation that finished while this load was in flight may be newer than the loaded copy: keep the newer.
            const merged = new Map(returns.map((request) => [request.rmaNo, request]));
            for (const local of apiSnapshot?.returns ?? []) {
                const loaded = merged.get(local.rmaNo);
                merged.set(local.rmaNo, loaded ? newer(loaded, local) : local);
            }
            publishApi([...merged.values()], true);
        })
        .catch(() => {
            // Show an empty list rather than a skeleton forever; the next subscriber tries again.
            apiLoadFailed = true;
            publishApi(apiSnapshot?.returns ?? [], true);
        })
        .finally(() => {
            apiLoad = null;
        });
    return apiLoad;
}

function mergeApiReturn(request: ReturnRequest): void {
    const current = apiSnapshot?.returns ?? [];
    const existing = current.find((candidate) => candidate.rmaNo === request.rmaNo);
    const next = existing
        ? current.map((candidate) => (candidate.rmaNo === request.rmaNo ? newer(existing, request) : candidate))
        : [...current, request];
    publishApi(next, true);
}

function newClientRequestId(): string {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function createReturnApi(input: CreateReturnInput): Promise<ReturnRequest> {
    if (input.items.length === 0) throw new Error('A return needs at least one item.');
    const { return: stored } = await requestJson<{ return: ReturnRequest }>(resourceRoutes.returnCreate, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
            orderNo: input.orderNo,
            clientRequestId: input.clientRequestId ?? newClientRequestId(),
            items: input.items,
        }),
    });
    // The server knows only what is saved on the order; keep the names and images the shopper just saw.
    const request: ReturnRequest = {
        ...stored,
        items: stored.items.map((item) => {
            const sent = input.items.find((candidate) => candidate.lineKey === item.lineKey);
            return sent ? { ...item, name: sent.name, imageUrl: sent.imageUrl, sku: sent.sku } : item;
        }),
    };
    mergeApiReturn(request);
    return request;
}

async function advanceStatusApi(rmaNo: string, expectedStatus?: ReturnStatus): Promise<ReturnRequest | undefined> {
    const current = apiSnapshot?.returns.find((request) => request.rmaNo === rmaNo);
    if (!current) return undefined;
    const { return: updated } = await requestJson<{ return: ReturnRequest }>(resourceRoutes.returnAdvance, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ orderNo: current.orderNo, rmaNo, expectedStatus }),
    });
    const merged: ReturnRequest = { ...updated, items: current.items };
    mergeApiReturn(merged);
    return apiSnapshot?.returns.find((request) => request.rmaNo === rmaNo) ?? merged;
}

// ---------------------------------------------------------------------------------------------------------------
// Subscription (shared)
// ---------------------------------------------------------------------------------------------------------------

export function subscribeToReturns(listener: () => void, backend: ReturnsBackend = 'browser'): () => void {
    activeBackend = backend;
    listeners.add(listener);

    if (backend === 'browser' && !storageListenerAttached && typeof window !== 'undefined') {
        window.addEventListener('storage', handleStorageEvent);
        storageListenerAttached = true;
    }
    // First subscriber (or a retry after a failed load) starts loading from the server.
    if (backend === 'api' && typeof window !== 'undefined' && (!apiSnapshot || apiLoadFailed)) void loadApi();

    return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && storageListenerAttached) {
            window.removeEventListener('storage', handleStorageEvent);
            storageListenerAttached = false;
        }
    };
}

export function getReturnsSnapshot(backend: ReturnsBackend = 'browser'): ReturnsSnapshot {
    if (typeof window === 'undefined') return SERVER_SNAPSHOT;
    if (backend === 'api') return apiSnapshot ?? SERVER_SNAPSHOT;
    // Also picks up a write from another tab whose `storage` event has not reached us yet.
    refresh();
    return snapshot ?? SERVER_SNAPSHOT;
}

export function getReturnsServerSnapshot(): ReturnsSnapshot {
    return SERVER_SNAPSHOT;
}

// ---------------------------------------------------------------------------------------------------------------
// Mock data generation (browser backend; the API backend generates these on the server)
// ---------------------------------------------------------------------------------------------------------------

function randomDigits(length: number): string {
    const bytes = new Uint32Array(length);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 10);
    }
    return Array.from(bytes, (value) => String(value % 10)).join('');
}

/** Bounded retry: ten attempts is far more than a demo store can collide on, then a timestamp suffix guarantees uniqueness. */
function generateRmaNo(existing: readonly ReturnRequest[]): string {
    const taken = new Set(existing.map((request) => request.rmaNo));
    for (let attempt = 0; attempt < RMA_ATTEMPTS; attempt += 1) {
        const candidate = `RMA-${randomDigits(6)}`;
        if (!taken.has(candidate)) return candidate;
    }
    return `RMA-${Date.now()}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Public API (async so a backend can replace this module's internals without touching callers)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Runs `work` right now, in the caller's tick, and wraps the outcome in a promise. The Promise executor is
 * synchronous, so the read-modify-write inside `work` is never split by an `await`.
 */
function runNow<T>(work: () => T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        try {
            resolve(work());
        } catch (error) {
            reject(error);
        }
    });
}

function readAll(): readonly ReturnRequest[] {
    if (activeBackend === 'api') return apiSnapshot?.returns ?? [];
    refresh();
    return snapshot?.returns ?? [];
}

export function listReturns(): Promise<readonly ReturnRequest[]> {
    return runNow(readAll);
}

export function getReturn(rmaNo: string): Promise<ReturnRequest | undefined> {
    return runNow(() => readAll().find((request) => request.rmaNo === rmaNo));
}

export function getReturnForOrder(orderNo: string): Promise<ReturnRequest | undefined> {
    return runNow(() => {
        const forOrder = readAll().filter((request) => request.orderNo === orderNo);
        return forOrder[forOrder.length - 1];
    });
}

export function createReturn(input: CreateReturnInput): Promise<ReturnRequest> {
    return activeBackend === 'api' ? createReturnApi(input) : runNow(() => createReturnBrowser(input));
}

function createReturnBrowser(input: CreateReturnInput): ReturnRequest {
    // No `await` before the write below: read, check and write happen in one uninterruptible block.
    refresh();
    const existing = [...(snapshot?.returns ?? [])];

    if (input.items.length === 0) throw new Error('A return needs at least one item.');

    // The same submission sent twice (a retry, a double click) returns the first request.
    if (input.clientRequestId) {
        const duplicate = existing.find((request) => request.clientRequestId === input.clientRequestId);
        if (duplicate) return duplicate;
    }

    const requested = new Map<string, number>();
    for (const request of existing) {
        if (request.orderNo !== input.orderNo) continue;
        for (const item of request.items)
            requested.set(item.lineKey, (requested.get(item.lineKey) ?? 0) + item.quantity);
    }
    for (const item of input.items) {
        const remaining = item.orderedQuantity - (requested.get(item.lineKey) ?? 0);
        if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > remaining) {
            throw new Error(`Quantity for ${item.lineKey} exceeds what can still be returned.`);
        }
    }

    const at = new Date().toISOString();
    const request: ReturnRequest = {
        rmaNo: generateRmaNo(existing),
        orderNo: input.orderNo,
        createdAt: at,
        status: 'submitted',
        history: [{ status: 'submitted', at }],
        items: input.items.map((item) => ({ ...item })),
        ...(input.clientRequestId ? { clientRequestId: input.clientRequestId } : {}),
    };
    commit([...existing, request]);
    return request;
}

/**
 * Moves a request one step forward.
 * @param expectedStatus The status the caller was looking at. If the stored status differs (a double click, or another
 * tab or device already advanced it), nothing changes and the current request is returned, so a step is never skipped.
 */
export function advanceStatus(rmaNo: string, expectedStatus?: ReturnStatus): Promise<ReturnRequest | undefined> {
    return activeBackend === 'api'
        ? advanceStatusApi(rmaNo, expectedStatus)
        : runNow(() => advanceStatusBrowser(rmaNo, expectedStatus));
}

function advanceStatusBrowser(rmaNo: string, expectedStatus?: ReturnStatus): ReturnRequest | undefined {
    refresh();
    const existing = [...(snapshot?.returns ?? [])];
    const index = existing.findIndex((request) => request.rmaNo === rmaNo);
    if (index === -1) return undefined;

    const current = existing[index];
    const updated = advanceStatusRecord(current, expectedStatus, new Date().toISOString());
    if (updated === current) return current;

    existing[index] = updated;
    commit(existing);
    return updated;
}

/** Test helper: clears module state so each test starts clean. Not used by the app. */
export function resetReturnStoreForTests(): void {
    snapshot = null;
    lastRaw = null;
    memoryRaw = null;
    storageUnavailable = false;
    activeBackend = 'browser';
    apiSnapshot = null;
    apiLoad = null;
    apiLoadFailed = false;
}
