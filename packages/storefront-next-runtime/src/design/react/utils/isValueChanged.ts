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
 * Shallow, by-value inequality check for two plain-object maps.
 *
 * Returns `true` when the objects differ by key count or by any top-level
 * value reference, `false` when they are shallowly equal.
 */
export function isValueChanged(obj1: unknown, obj2: unknown): boolean {
    if (Object.is(obj1, obj2)) {
        return false;
    }

    if (Array.isArray(obj1)) {
        if (Array.isArray(obj2)) {
            return obj1.length !== obj2.length || obj1.some((value, index) => !Object.is(value, obj2[index]));
        }

        return true;
    }

    if (typeof obj1 === 'object' && obj1 !== null && typeof obj2 === 'object' && obj2 !== null) {
        return (
            Object.keys(obj1).length !== Object.keys(obj2).length ||
            Object.entries(obj1).some(([key, value]) => !Object.is(value, (obj2 as Record<string, unknown>)?.[key]))
        );
    }

    return true;
}

export function isValueEqual(obj1: unknown, obj2: unknown): boolean {
    return !isValueChanged(obj1, obj2);
}
