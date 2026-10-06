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

export type Rfc3339Timestamp = {
    epochSecond: number;
    epochMilliseconds: number;
    fractionalSecond: string;
};

const RFC_3339_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/i;

/**
 * Parses a sortable RFC 3339 timestamp.
 *
 * Leap seconds and the unknown-offset form (`-00:00`) are rejected so every
 * accepted value represents an unambiguous instant.
 */
export function parseRfc3339Timestamp(timestamp: string): Rfc3339Timestamp | null {
    const match = timestamp.match(RFC_3339_TIMESTAMP);
    if (!match) return null;

    const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
    const fractionalSecond = match[7] ?? '';
    const offset = match[8].toUpperCase();
    const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = month === 2 ? (isLeapYear ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;

    if (month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) {
        return null;
    }

    if (offset !== 'Z') {
        const [offsetHour, offsetMinute] = offset.slice(1).split(':').map(Number);
        if (offset === '-00:00' || offsetHour > 23 || offsetMinute > 59) return null;
    }

    const epochSecond = Date.parse(timestamp.replace(/\.\d+(?=Z|[+-]\d{2}:\d{2}$)/i, '')) / 1000;
    if (!Number.isFinite(epochSecond)) return null;

    const millisecond = Number(`${fractionalSecond}000`.slice(0, 3));
    return {
        epochSecond,
        epochMilliseconds: epochSecond * 1000 + millisecond,
        fractionalSecond,
    };
}

function compareFractionalSeconds(left: string, right: string): number {
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
        const leftDigit = left[index] ?? '0';
        const rightDigit = right[index] ?? '0';
        if (leftDigit < rightDigit) return -1;
        if (leftDigit > rightDigit) return 1;
    }
    return 0;
}

export function compareRfc3339Timestamps(left: string, right: string): number | null {
    const leftTimestamp = parseRfc3339Timestamp(left);
    const rightTimestamp = parseRfc3339Timestamp(right);
    if (!leftTimestamp || !rightTimestamp) return null;

    const epochSecondDiff = leftTimestamp.epochSecond - rightTimestamp.epochSecond;
    return epochSecondDiff || compareFractionalSeconds(leftTimestamp.fractionalSecond, rightTimestamp.fractionalSecond);
}
