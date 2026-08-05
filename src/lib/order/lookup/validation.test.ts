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

import { describe, it, expect } from 'vitest';
import { parseOrderNumber, parseEmail, parseOtp } from './validation';
import { ErrorCode } from '@/lib/error-codes';

describe('lib/order/lookup/validation.ts', () => {
    describe('parseOrderNumber', () => {
        describe('valid inputs', () => {
            it('should accept 6-character alphanumeric order number', () => {
                const result = parseOrderNumber('ABC123');
                expect(result).toEqual({ ok: true, value: 'ABC123' });
            });

            it('should accept 32-character alphanumeric order number', () => {
                const result = parseOrderNumber('A'.repeat(32));
                expect(result).toEqual({ ok: true, value: 'A'.repeat(32) });
            });

            it('should accept order number with hyphens', () => {
                const result = parseOrderNumber('ORD-2024-12345');
                expect(result).toEqual({ ok: true, value: 'ORD-2024-12345' });
            });

            it('should accept mixed case alphanumeric', () => {
                const result = parseOrderNumber('AbC-123-DeF');
                expect(result).toEqual({ ok: true, value: 'AbC-123-DeF' });
            });

            it('should trim leading whitespace', () => {
                const result = parseOrderNumber('  ORDER123');
                expect(result).toEqual({ ok: true, value: 'ORDER123' });
            });

            it('should trim trailing whitespace', () => {
                const result = parseOrderNumber('ORDER123  ');
                expect(result).toEqual({ ok: true, value: 'ORDER123' });
            });

            it('should trim both leading and trailing whitespace', () => {
                const result = parseOrderNumber('  ORDER123  ');
                expect(result).toEqual({ ok: true, value: 'ORDER123' });
            });
        });

        describe('invalid inputs', () => {
            it('should reject order number shorter than 6 characters', () => {
                const result = parseOrderNumber('ABC12');
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject order number longer than 32 characters', () => {
                const result = parseOrderNumber('A'.repeat(33));
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject order number with special characters', () => {
                const result = parseOrderNumber('ORDER@123');
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject order number with spaces', () => {
                const result = parseOrderNumber('ORDER 123');
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject empty string', () => {
                const result = parseOrderNumber('');
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject whitespace-only string', () => {
                const result = parseOrderNumber('   ');
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject non-string number', () => {
                const result = parseOrderNumber(123456);
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject object', () => {
                const result = parseOrderNumber({ order: 'ABC123' });
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject null', () => {
                const result = parseOrderNumber(null);
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject undefined', () => {
                const result = parseOrderNumber(undefined);
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject array', () => {
                const result = parseOrderNumber(['ORDER123']);
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });
        });

        describe('ReDoS safety', () => {
            it('should handle long strings without catastrophic backtracking', () => {
                const longInput = 'a'.repeat(1000);
                const start = Date.now();
                const result = parseOrderNumber(longInput);
                const duration = Date.now() - start;

                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
                expect(duration).toBeLessThan(100);
            });

            it('should handle strings with many hyphens without catastrophic backtracking', () => {
                const longInput = '-'.repeat(1000);
                const start = Date.now();
                const result = parseOrderNumber(longInput);
                const duration = Date.now() - start;

                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
                expect(duration).toBeLessThan(100);
            });
        });
    });

    describe('parseEmail', () => {
        describe('valid inputs', () => {
            it('should accept standard email', () => {
                const result = parseEmail('user@example.com');
                expect(result).toEqual({ ok: true, value: 'user@example.com' });
            });

            it('should accept email with subdomain', () => {
                const result = parseEmail('user@mail.example.com');
                expect(result).toEqual({ ok: true, value: 'user@mail.example.com' });
            });

            it('should accept email with plus addressing', () => {
                const result = parseEmail('user+tag@example.com');
                expect(result).toEqual({ ok: true, value: 'user+tag@example.com' });
            });

            it('should accept email with dots in local part', () => {
                const result = parseEmail('first.last@example.com');
                expect(result).toEqual({ ok: true, value: 'first.last@example.com' });
            });

            it('should accept email with numbers', () => {
                const result = parseEmail('user123@example456.com');
                expect(result).toEqual({ ok: true, value: 'user123@example456.com' });
            });

            it('should accept email with hyphens', () => {
                const result = parseEmail('user-name@ex-ample.com');
                expect(result).toEqual({ ok: true, value: 'user-name@ex-ample.com' });
            });

            it('should accept email at 254 character limit', () => {
                const localPart = 'a'.repeat(64);
                const domainPart = `${'b'.repeat(185)}.com`;
                const email = `${localPart}@${domainPart}`;
                expect(email.length).toBe(254);

                const result = parseEmail(email);
                expect(result).toEqual({ ok: true, value: email });
            });
        });

        describe('invalid inputs', () => {
            it('should reject email without @', () => {
                const result = parseEmail('userexample.com');
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject email without domain', () => {
                const result = parseEmail('user@');
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject email without local part', () => {
                const result = parseEmail('@example.com');
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject email without TLD', () => {
                const result = parseEmail('user@example');
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject email with spaces', () => {
                const result = parseEmail('user @example.com');
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject email with multiple @', () => {
                const result = parseEmail('user@@example.com');
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject email longer than 254 characters', () => {
                const localPart = 'a'.repeat(64);
                const domainPart = `${'b'.repeat(186)}.com`;
                const email = `${localPart}@${domainPart}`;
                expect(email.length).toBe(255);

                const result = parseEmail(email);
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject empty string', () => {
                const result = parseEmail('');
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject non-string number', () => {
                const result = parseEmail(123);
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject object', () => {
                const result = parseEmail({ email: 'user@example.com' });
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject null', () => {
                const result = parseEmail(null);
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject undefined', () => {
                const result = parseEmail(undefined);
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject array', () => {
                const result = parseEmail(['user@example.com']);
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });
        });
    });

    describe('parseOtp', () => {
        describe('valid inputs', () => {
            it('should accept 6-digit OTP', () => {
                const result = parseOtp('123456');
                expect(result).toEqual({ ok: true, value: '123456' });
            });

            it('should accept OTP with leading zeros', () => {
                const result = parseOtp('000123');
                expect(result).toEqual({ ok: true, value: '000123' });
            });

            it('should accept all-zero OTP', () => {
                const result = parseOtp('000000');
                expect(result).toEqual({ ok: true, value: '000000' });
            });

            it('should accept all-nine OTP', () => {
                const result = parseOtp('999999');
                expect(result).toEqual({ ok: true, value: '999999' });
            });
        });

        describe('invalid inputs', () => {
            it('should reject OTP shorter than 6 digits', () => {
                const result = parseOtp('12345');
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject OTP longer than 6 digits', () => {
                const result = parseOtp('1234567');
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject OTP with spaces', () => {
                const result = parseOtp('123 456');
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject OTP with hyphens', () => {
                const result = parseOtp('123-456');
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject OTP with leading space', () => {
                const result = parseOtp(' 123456');
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject OTP with trailing space', () => {
                const result = parseOtp('123456 ');
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject OTP with letters', () => {
                const result = parseOtp('12A456');
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject empty string', () => {
                const result = parseOtp('');
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject non-string number', () => {
                const result = parseOtp(123456);
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject object', () => {
                const result = parseOtp({ code: '123456' });
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject null', () => {
                const result = parseOtp(null);
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject undefined', () => {
                const result = parseOtp(undefined);
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });

            it('should reject array', () => {
                const result = parseOtp(['123456']);
                expect(result).toEqual({ ok: false, code: ErrorCode.INVALID_INPUT });
            });
        });
    });
});
