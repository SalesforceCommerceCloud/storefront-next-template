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
 * Formats a date string (YYYY-MM-DD) to the user's locale numeric format.
 *
 * @param dateString - The date string in ISO format (YYYY-MM-DD)
 * @param locale - The locale to use for formatting (e.g., 'en-GB', 'it-IT')
 * @returns Formatted date string in the user's locale (e.g., 05/15/1990 for en-GB), or undefined if invalid
 *
 * @example
 * // Returns "05/15/1990" for en-GB
 * formatDateForLocale('1990-05-15', 'en-GB');
 *
 * @example
 * // Returns "15/05/1990" for it-IT
 * formatDateForLocale('1990-05-15', 'it-IT');
 *
 * @example
 * // Returns undefined for invalid date
 * formatDateForLocale('invalid-date', 'en-GB');
 */
export function formatDateForLocale(dateString: string | undefined, locale: string): string | undefined {
    if (!dateString) return undefined;
    try {
        // Parse the date string (YYYY-MM-DD format)
        // We parse manually to avoid timezone issues with new Date('YYYY-MM-DD')
        // which interprets the date as UTC midnight and can shift to previous day in some timezones
        const [year, month, day] = dateString.split('-').map(Number);
        if (!year || !month || !day || isNaN(year) || isNaN(month) || isNaN(day)) {
            return undefined;
        }

        // Create date using local timezone (months are 0-indexed)
        const date = new Date(year, month - 1, day);

        // Validate the date components match (handles invalid dates like Feb 30)
        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
            return undefined;
        }

        return date.toLocaleDateString(locale, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
    } catch {
        return undefined;
    }
}

/**
 * Formats a delivery window (RFC 3339 timestamps) to a locale-aware date string.
 * Returns a range ("Apr 30, 2026 – May 7, 2026") or a single date when start === end.
 * Returns undefined if the window is absent or timestamps are invalid.
 *
 * @param window - Object with startAt and endAt as RFC 3339 date-time strings
 * @param locale - The locale to use for formatting (e.g., 'en-GB', 'it-IT')
 */
export function formatDeliveryWindow(
    window: { startAt?: string; endAt?: string } | undefined,
    locale: string
): string | undefined {
    if (!window?.startAt || !window?.endAt) return undefined;
    try {
        const startDate = new Date(window.startAt);
        const endDate = new Date(window.endAt);
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return undefined;

        // Pin to UTC so SSR (MRT = UTC) and client produce the same calendar date regardless of
        // the shopper's local timezone. Delivery window timestamps are UTC instants from the hook.
        const options: Intl.DateTimeFormatOptions = {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'UTC',
        };
        const startFormatted = startDate.toLocaleDateString(locale, options);
        const endFormatted = endDate.toLocaleDateString(locale, options);

        return startFormatted === endFormatted ? startFormatted : `${startFormatted} – ${endFormatted}`;
    } catch {
        return undefined;
    }
}
