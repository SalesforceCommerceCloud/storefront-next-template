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
import { useRef, useCallback } from 'react';

export function useThrottledCallback<TArgs extends unknown[], TReturn>(
    callback: (...args: TArgs) => TReturn,
    interval: number,
    deps: unknown[] = []
): (...args: TArgs) => TReturn | void {
    const lastCallTime = useRef<number>(0);

    return useCallback(
        (...args: TArgs): TReturn | void => {
            const now = Date.now();

            if (now >= lastCallTime.current + interval) {
                lastCallTime.current = now;

                callback(...args);
            }
        },
        // oxlint-disable-next-line react-hooks/exhaustive-deps
        [callback, interval, ...deps]
    );
}
