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

import { useState, useEffect } from 'react';

/**
 * Provides a live countdown for rate-limit wait periods.
 *
 * @param seconds - Initial countdown value in seconds (optional)
 * @returns Countdown state with remaining seconds and done flag
 */
export function useRateLimitCountdown(seconds: number | undefined): {
    /** Remaining seconds, decremented every 1s. 0 when done, undefined, or not a finite number. */
    remaining: number;
    /** True once countdown reaches 0. Also true if seconds was undefined/0/NaN. */
    done: boolean;
} {
    // A malformed Retry-After header (e.g. non-numeric) can produce NaN — treat it as "no countdown"
    // rather than letting it fall through the `<= 0` / `=== 0` checks below, which NaN never satisfies.
    const normalize = (value: number | undefined) => (Number.isFinite(value) ? (value as number) : 0);

    const [remaining, setRemaining] = useState(() => normalize(seconds));

    useEffect(() => {
        // Reset when seconds prop changes
        setRemaining(normalize(seconds));
    }, [seconds]);

    useEffect(() => {
        // If no seconds or already at 0, nothing to do
        if (remaining <= 0) {
            return;
        }

        const intervalId = setInterval(() => {
            setRemaining((prev) => {
                const next = prev - 1;
                return next < 0 ? 0 : next;
            });
        }, 1000);

        return () => {
            clearInterval(intervalId);
        };
    }, [remaining]);

    return {
        remaining,
        done: remaining === 0,
    };
}
