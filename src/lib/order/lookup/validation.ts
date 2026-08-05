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

import { ErrorCode } from '@/lib/error-codes';

type ValidationSuccess = { ok: true; value: string };
type ValidationError = { ok: false; code: typeof ErrorCode.INVALID_INPUT };
type ValidationResult = ValidationSuccess | ValidationError;

const ORDER_NUMBER_REGEX = /^[a-zA-Z0-9-]{6,32}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_REGEX = /^\d{6}$/;

export function parseOrderNumber(input: unknown): ValidationResult {
    if (typeof input !== 'string') {
        return { ok: false, code: ErrorCode.INVALID_INPUT };
    }

    const trimmed = input.trim();

    if (!ORDER_NUMBER_REGEX.test(trimmed)) {
        return { ok: false, code: ErrorCode.INVALID_INPUT };
    }

    return { ok: true, value: trimmed };
}

export function parseEmail(input: unknown): ValidationResult {
    if (typeof input !== 'string') {
        return { ok: false, code: ErrorCode.INVALID_INPUT };
    }

    if (input.length > 254) {
        return { ok: false, code: ErrorCode.INVALID_INPUT };
    }

    if (!EMAIL_REGEX.test(input)) {
        return { ok: false, code: ErrorCode.INVALID_INPUT };
    }

    return { ok: true, value: input };
}

export function parseOtp(input: unknown): ValidationResult {
    if (typeof input !== 'string') {
        return { ok: false, code: ErrorCode.INVALID_INPUT };
    }

    if (!OTP_REGEX.test(input)) {
        return { ok: false, code: ErrorCode.INVALID_INPUT };
    }

    return { ok: true, value: input };
}
