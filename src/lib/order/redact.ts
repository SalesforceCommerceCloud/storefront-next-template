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
import type { ShopperOrders } from '@/scapi';

/**
 * Redact an order to only include allowed fields.
 * Fields NOT in the allow-list are completely absent from the returned object (not null/undefined).
 *
 * Email addresses are masked to `t***@example.com` format (first char of local part, rest replaced with `***`, domain kept).
 *
 * This is the server-side defence-in-depth boundary — the loader calls this before returning to the UI.
 *
 * @param order - Full SCAPI Order object
 * @param allowedFields - Array of field paths (dotted, e.g. "customerInfo.email"). A path segment
 * that resolves to an array (e.g. "paymentInstruments.paymentCard.cardType") is applied to every
 * element of that array, preserving per-element structure rather than flattening it.
 * @returns Redacted order with only allowed fields present
 */
export function redactOrder(
    order: ShopperOrders.schemas['Order'],
    allowedFields: string[]
): Partial<ShopperOrders.schemas['Order']> {
    const redacted: Record<string, unknown> = {};

    for (const fieldPath of allowedFields) {
        const parts = fieldPath.split('.');
        const isEmailField = fieldPath.toLowerCase().includes('email');
        copyFieldPath(order, redacted, parts, isEmailField);
    }

    return redacted as Partial<ShopperOrders.schemas['Order']>;
}

/**
 * Copies the value at `path` from `source` into `target`, in place. When a path segment resolves
 * to an array, recurses into each element with the remaining path so array items keep their own
 * structure (fields from separate allowedFields entries merge into the same element by index)
 * instead of being flattened into a single array of scalars.
 */
function copyFieldPath(source: unknown, target: Record<string, unknown>, path: string[], isEmailField: boolean): void {
    if (source == null || typeof source !== 'object') {
        return;
    }

    const [key, ...rest] = path;
    const value = (source as Record<string, unknown>)[key];

    if (value === undefined) {
        return;
    }

    if (rest.length === 0) {
        target[key] = isEmailField && typeof value === 'string' ? maskEmail(value) : value;
        return;
    }

    if (Array.isArray(value)) {
        const targetArray = Array.isArray(target[key]) ? (target[key] as unknown[]) : [];
        value.forEach((item, index) => {
            if (typeof targetArray[index] !== 'object' || targetArray[index] === null) {
                targetArray[index] = {};
            }
            copyFieldPath(item, targetArray[index] as Record<string, unknown>, rest, isEmailField);
        });
        target[key] = targetArray;
        return;
    }

    if (typeof value !== 'object') {
        return;
    }

    const targetChild = typeof target[key] === 'object' && target[key] !== null ? target[key] : {};
    copyFieldPath(value, targetChild as Record<string, unknown>, rest, isEmailField);
    target[key] = targetChild;
}

/**
 * Mask an email address to `t***@example.com` format.
 * First character of local part is kept, rest replaced with `***`, domain kept.
 */
function maskEmail(email: string): string {
    const atIndex = email.indexOf('@');
    if (atIndex === -1) {
        // Malformed email (no `@`) — mask fully rather than leaking the raw value to the client.
        return '***@***';
    }

    const localPart = email.slice(0, atIndex);
    const domain = email.slice(atIndex);

    if (localPart.length === 0) {
        return `***${domain}`;
    }

    return `${localPart[0]}***${domain}`;
}
