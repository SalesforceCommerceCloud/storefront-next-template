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

import { describe, expect, it } from 'vitest';

import {
    ERROR_MESSAGE_KEYS,
    extractErrorMessage,
    getPasswordlessErrorMessageKey,
    getPasswordResetErrorMessageKey,
} from './error-handler';

describe('getPasswordlessErrorMessageKey', () => {
    it.each([
        'No callback_uri is registered for this client',
        "Callback_uri doesn't match the registered value",
        'Monthly quota exceeded for passwordless login',
        'Passwordless permissions error: feature disabled',
        'Client secret is not provided for passwordless login',
    ])('returns FEATURE_UNAVAILABLE for "%s"', (message) => {
        expect(getPasswordlessErrorMessageKey(message)).toBe(ERROR_MESSAGE_KEYS.FEATURE_UNAVAILABLE);
    });

    it('returns TOO_MANY_LOGIN_ATTEMPTS when too many requests are detected', () => {
        const message = 'Too many login requests. Please try again later.';
        expect(getPasswordlessErrorMessageKey(message)).toBe(ERROR_MESSAGE_KEYS.TOO_MANY_LOGIN_ATTEMPTS);
    });

    it('returns INVALID_TOKEN for invalid token errors', () => {
        const message = 'Invalid authentication token provided.';
        expect(getPasswordlessErrorMessageKey(message)).toBe(ERROR_MESSAGE_KEYS.INVALID_TOKEN);
    });

    it('returns GENERIC for unknown error messages', () => {
        const message = 'Some unexpected error from backend';
        expect(getPasswordlessErrorMessageKey(message)).toBe(ERROR_MESSAGE_KEYS.GENERIC);
    });
});

describe('getPasswordResetErrorMessageKey', () => {
    it.each([
        'No callback_uri is registered for this client',
        "Callback_uri doesn't match the registered value",
        'Monthly quota exceeded for password resets',
    ])('returns FEATURE_UNAVAILABLE for "%s"', (message) => {
        expect(getPasswordResetErrorMessageKey(message)).toBe(ERROR_MESSAGE_KEYS.FEATURE_UNAVAILABLE);
    });

    it('returns TOO_MANY_PASSWORD_RESET_ATTEMPTS when rate limited', () => {
        const message = 'Too many password reset requests. Please try again later.';
        expect(getPasswordResetErrorMessageKey(message)).toBe(ERROR_MESSAGE_KEYS.TOO_MANY_PASSWORD_RESET_ATTEMPTS);
    });

    it.each([
        'Invalid authentication token provided.',
        'invalid token',
        'INVALID TOKEN',
    ])('returns INVALID_TOKEN for "%s"', (message) => {
        expect(getPasswordResetErrorMessageKey(message)).toBe(ERROR_MESSAGE_KEYS.INVALID_TOKEN);
    });

    it('returns GENERIC for unknown error messages', () => {
        const message = 'Some unexpected error from backend';
        expect(getPasswordResetErrorMessageKey(message)).toBe(ERROR_MESSAGE_KEYS.GENERIC);
    });
});

describe('extractErrorMessage', () => {
    it('returns the string itself when error is a string', () => {
        expect(extractErrorMessage('simple error')).toBe('simple error');
    });

    it('returns error.message when present and a string', () => {
        const error = { message: 'top-level message' };
        expect(extractErrorMessage(error)).toBe('top-level message');
    });

    it('returns error.fault.message when present and top-level message is missing', () => {
        const error = { fault: { message: 'fault message' } };
        expect(extractErrorMessage(error)).toBe('fault message');
    });

    it('prefers top-level message over fault.message when both are present', () => {
        const error = { message: 'primary message', fault: { message: 'secondary message' } };
        expect(extractErrorMessage(error)).toBe('primary message');
    });

    it('prefers rawBody message over top-level message when rawBody has a message field', () => {
        const error = {
            message: 'API Error 401: Unauthorized (POST http://localhost:5173/...)',
            rawBody: '{"status_code":"401 UNAUTHORIZED","message":"invalid token"}',
        };
        expect(extractErrorMessage(error)).toBe('invalid token');
    });

    it('falls back to top-level message when rawBody is not valid JSON', () => {
        const error = { message: 'fallback message', rawBody: 'not-json' };
        expect(extractErrorMessage(error)).toBe('fallback message');
    });

    it('falls back to top-level message when rawBody JSON has no message field', () => {
        const error = { message: 'fallback message', rawBody: '{"status_code":"401 UNAUTHORIZED"}' };
        expect(extractErrorMessage(error)).toBe('fallback message');
    });

    it.each([null, undefined, 42, {}])('returns "Unknown error" for %s', (input) => {
        expect(extractErrorMessage(input)).toBe('Unknown error');
    });
});
