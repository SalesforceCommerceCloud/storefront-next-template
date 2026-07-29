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
 * Cloudflare Turnstile platform-health detection (two-tier design).
 *
 * Tier 1 - SITEVERIFY METRICS (PRIMARY)
 *   Every siteverify call records its outcome (success/CF-failure) and duration in a
 *   60-second sliding window backed by a fixed-size ring buffer. Two independent failure
 *   conditions can trigger the degraded verdict:
 *     a) Failure rate over the window crosses the threshold (with hysteresis to avoid flap)
 *     b) p95 latency over the window exceeds the threshold (slow-but-not-failed degradation)
 *   Both require a minimum number of samples to be authoritative.
 *
 * Tier 2 - CDN PROBE (SECONDARY / BOOTSTRAP)
 *   HEAD request to the Turnstile script URL. Used when tier 1 has too few samples
 *   (low-traffic instance or fresh cold start).
 *
 * Either tier indicating degraded triggers fail-open. Results are cached per tier with
 * stale-while-revalidate so probes never add latency to the request path.
 *
 * Per-instance state: each MRT instance maintains its own metrics and caches. There is no
 * cross-instance coordination because the SDK does not expose a writable shared store. For
 * a real outage all instances see failures simultaneously and each independently observes
 * the threshold crossing; this is a reasonable trade-off for zero-coordination simplicity.
 *
 * Ring sizing vs. window: capacity caps memory at 200 samples. Above ~3.3 sustained QPS
 * the ring evicts before the window does, so the effective measurement window shrinks.
 * Default 200 is sized for typical low-to-moderate per-instance traffic; bump
 * TURNSTILE_HEALTH_RING_CAPACITY for high-throughput instances.
 *
 * @env TURNSTILE_CDN_PROBE_URL - Override CDN probe URL (default: Cloudflare Turnstile script).
 * @env TURNSTILE_HEALTH_WINDOW_MS - Sliding window length in ms (default: 60000).
 * @env TURNSTILE_HEALTH_MIN_SAMPLES - Min samples before tier 1 is authoritative (default: 5).
 * @env TURNSTILE_HEALTH_RING_CAPACITY - Max samples retained in memory (default: 200).
 * @env TURNSTILE_HEALTH_RATE_ENTER - Failure rate that flips healthy → degraded (default: 0.5).
 * @env TURNSTILE_HEALTH_RATE_EXIT - Failure rate that flips degraded → healthy (default: 0.3).
 * @env TURNSTILE_HEALTH_MIN_FAILURES - Absolute failure floor for rate-driven entry (default: 3).
 * @env TURNSTILE_HEALTH_LATENCY_P95_MS - p95 latency that flips healthy → degraded (default: 3000).
 */

const DEFAULT_CDN_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

const CDN_PROBE_TIMEOUT_MS = 3000;
const CDN_CACHE_TTL_MS = 60_000;

function envInt(name: string, fallback: number, { min, max }: { min?: number; max?: number } = {}): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return fallback;
    if (min !== undefined && n < min) return fallback;
    if (max !== undefined && n > max) return fallback;
    return n;
}

function envFloat(name: string, fallback: number, { min, max }: { min?: number; max?: number } = {}): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    if (min !== undefined && n < min) return fallback;
    if (max !== undefined && n > max) return fallback;
    return n;
}

// Tier 1 (siteverify metrics) configuration. Reads env once at module load — operators
// changing thresholds during an incident need a redeploy/restart, which matches the
// rollout cadence of any other config change on MRT.
const SITEVERIFY_WINDOW_MS = envInt('TURNSTILE_HEALTH_WINDOW_MS', 60_000, { min: 1_000 });
const SITEVERIFY_MIN_SAMPLES = envInt('TURNSTILE_HEALTH_MIN_SAMPLES', 5, { min: 1 });
const SITEVERIFY_RING_CAPACITY = envInt('TURNSTILE_HEALTH_RING_CAPACITY', 200, { min: 10, max: 10_000 });

// Hysteresis: enter degraded at one rate, exit at a lower rate. Eliminates flap when the
// rate hovers near a single threshold. Validated to be in (0, 1].
const SITEVERIFY_FAILURE_RATE_ENTER = envFloat('TURNSTILE_HEALTH_RATE_ENTER', 0.5, { min: 0, max: 1 });
const SITEVERIFY_FAILURE_RATE_EXIT = envFloat('TURNSTILE_HEALTH_RATE_EXIT', 0.3, { min: 0, max: 1 });

// Absolute-failure-count guard. Under DEFAULT thresholds (MIN_SAMPLES=5, RATE_ENTER=0.5)
// this is mathematically redundant: any sample×rate combination satisfying both already
// implies failures ≥ 3. The guard becomes load-bearing when an operator dials RATE_ENTER
// down via TURNSTILE_HEALTH_RATE_ENTER (e.g. to 0.2). Without it, two flaky samples could
// flip the verdict at low rate thresholds. Cheap defense-in-depth for misconfiguration.
const SITEVERIFY_MIN_FAILURES_FOR_DEGRADED = envInt('TURNSTILE_HEALTH_MIN_FAILURES', 3, { min: 1 });

// Latency dimension: p95 above this threshold is treated as a failure signal even if
// individual calls technically succeed. Cloudflare's siteverify is sub-second under normal
// load; sustained multi-second p95 is degradation in everything but name.
const SITEVERIFY_LATENCY_P95_THRESHOLD_MS = envInt('TURNSTILE_HEALTH_LATENCY_P95_MS', 3000, { min: 100 });

interface HealthCache {
    degraded: boolean;
    checkedAt: number;
}

/** A single recorded siteverify call outcome. */
interface SiteverifySample {
    timestamp: number;
    /** True if CF-side failure (internal-error / 5xx / network / timeout). */
    failed: boolean;
    /** Wall-clock duration of the siteverify call in milliseconds. */
    durationMs: number;
}

let cdnCache: HealthCache | null = null;
let cdnRefreshInFlight = false;
// Dedupes concurrent cold-start probes. When the cache is empty, the first call to
// `getCdnHealth` kicks off a HEAD probe; concurrent callers await the same in-flight
// promise instead of each issuing their own (avoids thundering herd on instance boot).
let cdnInitialProbe: Promise<boolean> | null = null;

// Ring-buffer state. Fixed capacity (no per-call allocation) plus head pointer + count.
// Slots store null until first write; live samples occupy `count` slots starting at `head`.
const siteverifyRing: Array<SiteverifySample | null> = new Array(SITEVERIFY_RING_CAPACITY).fill(null);
let siteverifyHead = 0;
let siteverifyCount = 0;

// Hysteresis state: persists across calls. We enter degraded when the rate exceeds
// `RATE_ENTER` and leave only when it drops below `RATE_EXIT`. Initial state is healthy.
let currentSiteverifyVerdict = false;

/**
 * Cached snapshot of the metrics derived during the most recent verdict computation.
 * Populated by `getSiteverifyHealth()`, invalidated whenever the underlying samples
 * change (record, prune). Lets `getSiteverifyMetricsSnapshot()` return without
 * re-iterating the ring (the hot path during sustained outages, which logs the
 * snapshot on every fail-open decision).
 */
interface CachedSnapshot {
    sampleCount: number;
    failureCount: number;
    failureRate: number;
    p95LatencyMs: number;
    currentVerdict: boolean;
}
let cachedSnapshot: CachedSnapshot | null = null;

function invalidateCachedSnapshot(): void {
    cachedSnapshot = null;
}

/**
 * Records a single siteverify outcome. Called by `verifyTurnstileToken` after every
 * siteverify request so the health signal stays current with real traffic.
 *
 * @param failed - True only for CF-side issues that justify fail-open: `internal-error`
 *                 response code, HTTP 5xx, network errors, or timeouts. Bot-detection
 *                 failures (`invalid-input-response`, etc.) should pass `false` because
 *                 they reflect a working service correctly rejecting a bad token.
 * @param durationMs - Wall-clock duration of the siteverify call. Used for the latency
 *                     dimension of the health signal.
 */
export function recordSiteverifyOutcome(failed: boolean, durationMs: number = 0): void {
    const now = Date.now();
    const sample: SiteverifySample = { timestamp: now, failed, durationMs };

    if (siteverifyCount < SITEVERIFY_RING_CAPACITY) {
        // Ring not yet full - append at tail.
        const tail = (siteverifyHead + siteverifyCount) % SITEVERIFY_RING_CAPACITY;
        siteverifyRing[tail] = sample;
        siteverifyCount++;
    } else {
        // Ring full - overwrite the oldest slot, advance head.
        siteverifyRing[siteverifyHead] = sample;
        siteverifyHead = (siteverifyHead + 1) % SITEVERIFY_RING_CAPACITY;
    }

    pruneSiteverifyByAge(now);
    invalidateCachedSnapshot();
}

/**
 * Drops samples older than the window. O(k) where k is the number of expired samples,
 * rather than O(n) of the previous slice-based implementation.
 */
function pruneSiteverifyByAge(now: number): void {
    const cutoff = now - SITEVERIFY_WINDOW_MS;
    let evicted = 0;
    while (siteverifyCount > 0) {
        const oldest = siteverifyRing[siteverifyHead];
        if (oldest && oldest.timestamp >= cutoff) break;
        siteverifyRing[siteverifyHead] = null;
        siteverifyHead = (siteverifyHead + 1) % SITEVERIFY_RING_CAPACITY;
        siteverifyCount--;
        evicted++;
    }
    if (evicted > 0) invalidateCachedSnapshot();
}

/**
 * Iterates over the live samples in chronological order. Internal helper.
 *
 * Invariant: slots in `[siteverifyHead, siteverifyHead + siteverifyCount)` (mod capacity)
 * are always non-null because `recordSiteverifyOutcome` writes to a slot before bumping
 * `siteverifyCount`, and `pruneSiteverifyByAge` nulls out slots before bumping `siteverifyHead`
 * past them. The non-null assertion below documents this invariant.
 */
function* siteverifyIter(): IterableIterator<SiteverifySample> {
    for (let i = 0; i < siteverifyCount; i++) {
        // oxlint-disable-next-line @typescript-eslint/no-non-null-assertion
        yield siteverifyRing[(siteverifyHead + i) % SITEVERIFY_RING_CAPACITY]!;
    }
}

/** Computes the p95 latency over the live samples. Returns 0 when no samples exist. */
function computeSiteverifyP95Latency(): number {
    if (siteverifyCount === 0) return 0;
    const durations: number[] = [];
    for (const sample of siteverifyIter()) durations.push(sample.durationMs);
    durations.sort((a, b) => a - b);
    // Nearest-rank p95: index = ceil(0.95 * n) - 1 in 0-based terms.
    const idx = Math.min(durations.length - 1, Math.ceil(0.95 * durations.length) - 1);
    return durations[Math.max(0, idx)];
}

/** Counts the number of failed samples over the live window. */
function countSiteverifyFailures(): number {
    let count = 0;
    for (const sample of siteverifyIter()) if (sample.failed) count++;
    return count;
}

/**
 * Returns the siteverify-window health verdict, applying hysteresis:
 *   - true:  current state is degraded; remains degraded until rate drops below EXIT
 *            (or sample count drops below the minimum and we consult lower tiers)
 *   - false: current state is healthy; flips to degraded only when ALL of:
 *              - sample count >= MIN_SAMPLES
 *              - failure count >= MIN_FAILURES_FOR_DEGRADED
 *              - failure rate >= RATE_ENTER, OR
 *                p95 latency >= LATENCY_P95_THRESHOLD_MS
 *   - null:  not enough samples to draw any conclusion (use lower tiers instead). Only
 *            returned when the current verdict is healthy AND samples < MIN_SAMPLES; once
 *            we are in the degraded state we stay there until the window naturally
 *            recovers (preventing flap).
 */
function getSiteverifyHealth(): boolean | null {
    pruneSiteverifyByAge(Date.now());

    // Compute once and reuse for both verdict logic and the cached snapshot.
    const failures = countSiteverifyFailures();
    const rate = siteverifyCount > 0 ? failures / siteverifyCount : 0;
    const p95 = computeSiteverifyP95Latency();

    let verdict: boolean | null;

    if (currentSiteverifyVerdict) {
        // Currently degraded: stay degraded unless the EXIT condition is met.
        if (siteverifyCount < SITEVERIFY_MIN_SAMPLES) {
            // Not enough samples to declare a recovery - hold the existing degraded
            // verdict so we don't flap to "unknown" mid-outage.
            verdict = true;
        } else {
            // Recover only when BOTH dimensions clearly improve. Either dimension still
            // breaching its threshold keeps us degraded.
            const rateOk = rate < SITEVERIFY_FAILURE_RATE_EXIT;
            const latencyOk = p95 < SITEVERIFY_LATENCY_P95_THRESHOLD_MS;
            if (rateOk && latencyOk) {
                currentSiteverifyVerdict = false;
                verdict = false;
            } else {
                verdict = true;
            }
        }
    } else if (siteverifyCount < SITEVERIFY_MIN_SAMPLES) {
        verdict = null;
    } else {
        const rateBreaches = failures >= SITEVERIFY_MIN_FAILURES_FOR_DEGRADED && rate >= SITEVERIFY_FAILURE_RATE_ENTER;
        const latencyBreaches = p95 >= SITEVERIFY_LATENCY_P95_THRESHOLD_MS;
        if (rateBreaches || latencyBreaches) {
            currentSiteverifyVerdict = true;
            verdict = true;
        } else {
            verdict = false;
        }
    }

    cachedSnapshot = {
        sampleCount: siteverifyCount,
        failureCount: failures,
        failureRate: rate,
        p95LatencyMs: p95,
        currentVerdict: currentSiteverifyVerdict,
    };

    return verdict;
}

// Note: isCdnDown already catches its own errors and never rejects, so the refresh path
// below intentionally has no .catch - one would be dead code.

function refreshCdnCache(): void {
    if (cdnRefreshInFlight) return;
    cdnRefreshInFlight = true;
    void isCdnDown()
        .then((cdnDown) => {
            cdnCache = { degraded: cdnDown, checkedAt: Date.now() };
        })
        .finally(() => {
            cdnRefreshInFlight = false;
        });
}

/**
 * Returns true if the Turnstile platform is currently degraded.
 *
 * Two-tier check (either tier indicating degraded returns true):
 *   Tier 1 (PRIMARY):   siteverify-window health (failure rate + p95 latency, with
 *                       hysteresis). Directly measures the dependency we use.
 *   Tier 2 (SECONDARY): CDN probe. Fast, but measures the static CDN, not siteverify.
 *                       Used when tier 1 has too few samples (low-traffic instance,
 *                       cold start).
 */
export async function isTurnstileDegraded(): Promise<boolean> {
    const siteverifyHealth = getSiteverifyHealth();
    if (siteverifyHealth === true) return true;
    if (siteverifyHealth === false) return false;

    // siteverifyHealth === null - not enough recent samples; consult the CDN probe.
    return await getCdnHealth();
}

async function getCdnHealth(): Promise<boolean> {
    if (cdnCache) {
        const age = Date.now() - cdnCache.checkedAt;
        if (age < CDN_CACHE_TTL_MS) {
            return cdnCache.degraded;
        }
        refreshCdnCache();
        return cdnCache.degraded;
    }

    // Cold start: dedupe concurrent first-time probes onto a single in-flight HEAD.
    if (cdnInitialProbe) {
        return await cdnInitialProbe;
    }
    cdnInitialProbe = isCdnDown().then((degraded) => {
        cdnCache = { degraded, checkedAt: Date.now() };
        return degraded;
    });
    try {
        return await cdnInitialProbe;
    } finally {
        cdnInitialProbe = null;
    }
}

async function isCdnDown(): Promise<boolean> {
    const url = process.env.TURNSTILE_CDN_PROBE_URL || DEFAULT_CDN_URL;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CDN_PROBE_TIMEOUT_MS);

        const response = await fetch(url, {
            method: 'HEAD',
            signal: controller.signal,
        });

        clearTimeout(timeoutId);
        return response.status >= 500;
    } catch {
        return true;
    }
}

/** Exposed for testing - resets all in-memory caches and metrics. */
export function resetHealthCache(): void {
    cdnCache = null;
    cdnRefreshInFlight = false;
    cdnInitialProbe = null;

    for (let i = 0; i < SITEVERIFY_RING_CAPACITY; i++) siteverifyRing[i] = null;
    siteverifyHead = 0;
    siteverifyCount = 0;
    currentSiteverifyVerdict = false;
    cachedSnapshot = null;
}

/**
 * Returns the current tier-1 metric snapshot. Used by `enforceTurnstile` to enrich
 * fail-open log lines with `{sampleCount, failureCount, failureRate, p95LatencyMs,
 * currentVerdict}` so operators can see the in-the-moment state of the window during
 * an outage.
 *
 * Hot-path performance: returns a cached snapshot in O(1) on every call following a
 * verdict computation. The cache is invalidated on `recordSiteverifyOutcome` and on
 * any age-based pruning that evicts samples; if the cache is stale, this function
 * recomputes by calling `getSiteverifyHealth()` (which repopulates the cache as a
 * side effect). Recomputation is O(n log n) for the p95 sort with n bounded by 200.
 */
export function getSiteverifyMetricsSnapshot(): CachedSnapshot {
    // Always prune first - if any sample expired, the cache is invalidated and we'll
    // fall through to a fresh compute. Cheap when no eviction occurs.
    pruneSiteverifyByAge(Date.now());
    if (cachedSnapshot) return cachedSnapshot;
    // Calling the verdict computation populates the cache as a side effect.
    getSiteverifyHealth();
    // After the call above, cachedSnapshot is always set (computed unconditionally).
    // Type assertion needed because TS doesn't track the side effect.
    return cachedSnapshot as unknown as CachedSnapshot;
}
