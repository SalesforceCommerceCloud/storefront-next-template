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
 * Error message patterns for passwordless login and password reset features
 */

// Shared error patterns for token-based auth features (passwordless login, password reset)
const TOKEN_BASED_AUTH_FEATURE_UNAVAILABLE_ERRORS = [
    /no callback_uri is registered/i,
    /callback_uri doesn't match/i,
    /monthly quota/i,
];

const PASSWORDLESS_FEATURE_UNAVAILABLE_ERRORS = [
    ...TOKEN_BASED_AUTH_FEATURE_UNAVAILABLE_ERRORS,
    /passwordless permissions error/i,
    /client secret is not provided/i,
];

const TOO_MANY_REQUESTS_ERROR = /too many .* requests/i;

const INVALID_TOKEN_ERROR = /invalid.*token/i;

const LOGIN_ID_MISMATCH_ERROR = 'login_id does not match stored login_id';

// Exact SLAS messages for a missing or mismatched login_id on the token exchange
const MISSING_OR_MISMATCHED_LOGIN_ID_ERRORS = [
    LOGIN_ID_MISMATCH_ERROR,
    'login_id is required',
    'login id is required for Passwordless Login authentication',
].map((message) => message.toLowerCase());

/**
 * True when SLAS rejected a passwordless token exchange because `login_id` isn't the email the
 * link was requested for. SLAS consumes the token before this check, so the link can't be retried.
 */
export const isLoginIdMismatchError = (errorMessage: string): boolean =>
    String(errorMessage).trim().toLowerCase() === LOGIN_ID_MISMATCH_ERROR;

const isInvalidTokenError = (errorMessage: string): boolean =>
    INVALID_TOKEN_ERROR.test(errorMessage) ||
    MISSING_OR_MISMATCHED_LOGIN_ID_ERRORS.includes(String(errorMessage).trim().toLowerCase());

/**
 * Error message translation keys for different error scenarios
 */
export const ERROR_MESSAGE_KEYS = {
    FEATURE_UNAVAILABLE: 'errors:featureUnavailable',
    TOO_MANY_LOGIN_ATTEMPTS: 'errors:tooManyLoginAttempts',
    TOO_MANY_PASSWORD_RESET_ATTEMPTS: 'errors:tooManyPasswordResetAttempts',
    INVALID_TOKEN: 'errors:invalidToken',
    GENERIC: 'errors:genericTryAgain',
} as const;

/**
 * Maps an error message to the appropriate user-friendly error message translation key
 * for passwordless login feature errors.
 *
 * @param errorMessage - The error message from the API
 * @returns The translation key that can be passed to t()
 */
export function getPasswordlessErrorMessageKey(
    errorMessage: string
): (typeof ERROR_MESSAGE_KEYS)[keyof typeof ERROR_MESSAGE_KEYS] {
    if (PASSWORDLESS_FEATURE_UNAVAILABLE_ERRORS.some((pattern) => pattern.test(errorMessage))) {
        return ERROR_MESSAGE_KEYS.FEATURE_UNAVAILABLE;
    }
    if (TOO_MANY_REQUESTS_ERROR.test(errorMessage)) {
        return ERROR_MESSAGE_KEYS.TOO_MANY_LOGIN_ATTEMPTS;
    }
    if (isInvalidTokenError(errorMessage)) {
        return ERROR_MESSAGE_KEYS.INVALID_TOKEN;
    }
    return ERROR_MESSAGE_KEYS.GENERIC;
}

/**
 * Maps an error message to the appropriate user-friendly error message translation key
 * for password reset feature errors.
 *
 * @param errorMessage - The error message from the API
 * @returns The translation key that can be passed to t()
 */
export function getPasswordResetErrorMessageKey(
    errorMessage: string
): (typeof ERROR_MESSAGE_KEYS)[keyof typeof ERROR_MESSAGE_KEYS] {
    if (TOKEN_BASED_AUTH_FEATURE_UNAVAILABLE_ERRORS.some((pattern) => pattern.test(errorMessage))) {
        return ERROR_MESSAGE_KEYS.FEATURE_UNAVAILABLE;
    }
    if (TOO_MANY_REQUESTS_ERROR.test(errorMessage)) {
        return ERROR_MESSAGE_KEYS.TOO_MANY_PASSWORD_RESET_ATTEMPTS;
    }
    if (isInvalidTokenError(errorMessage)) {
        return ERROR_MESSAGE_KEYS.INVALID_TOKEN;
    }
    return ERROR_MESSAGE_KEYS.GENERIC;
}

/**
 * Extracts error message from various error object formats
 *
 * @param error - The error object from the API
 * @returns The error message string
 */
export function extractErrorMessage(error: unknown): string {
    if (typeof error === 'string') {
        return error;
    }
    if (error && typeof error === 'object') {
        // Try to extract the actual API error message from rawBody first (e.g., SDK ApiError)
        if ('rawBody' in error && typeof error.rawBody === 'string') {
            try {
                const parsed = JSON.parse(error.rawBody) as unknown;
                if (parsed && typeof parsed === 'object' && 'message' in parsed && typeof parsed.message === 'string') {
                    return parsed.message;
                }
            } catch {
                // rawBody is not valid JSON, fall through
            }
        }
        if ('message' in error && typeof error.message === 'string') {
            return error.message;
        }
        if ('fault' in error && error.fault && typeof error.fault === 'object') {
            if ('message' in error.fault && typeof error.fault.message === 'string') {
                return error.fault.message;
            }
        }
    }
    return 'Unknown error';
}
