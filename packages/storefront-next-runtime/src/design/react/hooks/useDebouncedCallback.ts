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

export function useDebouncedCallback<TArgs extends unknown[], TReturn>(
    callback: (...args: TArgs) => TReturn,
    interval: number,
    deps: unknown[] = []
): (...args: TArgs) => TReturn | void {
    const timeoutRef = useRef<number | null>(null);

    return useCallback(
        (...args: TArgs): TReturn | void => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }

            timeoutRef.current = setTimeout(() => {
                callback(...args);
                timeoutRef.current = null;
            }, interval) as unknown as number;
        },
        // oxlint-disable-next-line react-hooks/exhaustive-deps
        [callback, interval, ...deps]
    );
}
