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
 * Minimum wall-clock duration of a public password reset request.
 *
 * Measured from outside against SLAS, a reset for an account that exists (a link is sent) took a
 * median of ~480 ms (p90 ~620 ms, max ~850 ms) while an unknown email took ~330 ms, a gap that is
 * statistically obvious. Holding every response to the same floor hides that gap for
 * any request that finishes under it. The value sits above the observed p90 of the slowest path.
 * Requests that overrun the floor are not delayed further, so a tail slower than this can still
 * leak a difference; raise the floor if SLAS latency in your region is higher.
 */
export const PASSWORD_RESET_MIN_RESPONSE_MS = 1000;

/**
 * Run `work`, and do not settle until at least `minMs` have elapsed since it started, whether it
 * resolves or throws.
 *
 * The response can't be sent early and the work finished in the background: on Managed Runtime the
 * Lambda response stream ends the invocation, so fire-and-forget work is not reliably completed.
 * Padding the response time is the only portable way to remove a timing difference between code
 * paths that call out to SLAS and ones that don't.
 */
export async function withMinimumDuration<T>(minMs: number, work: () => Promise<T>): Promise<T> {
    const startedAt = performance.now();
    try {
        return await work();
    } finally {
        const remaining = minMs - (performance.now() - startedAt);
        if (remaining > 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, remaining));
        }
    }
}
