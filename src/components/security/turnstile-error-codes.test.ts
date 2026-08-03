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
import { describe, test, expect } from 'vitest';
import { classifyTurnstileErrorCode, TURNSTILE_ERROR_FAMILY } from './turnstile-error-codes';

describe('TURNSTILE_ERROR_FAMILY constants', () => {
    test('INFRASTRUCTURE is "infrastructure"', () => {
        expect(TURNSTILE_ERROR_FAMILY.INFRASTRUCTURE).toBe('infrastructure');
    });

    test('BOT_DETECTION is "bot-detection"', () => {
        expect(TURNSTILE_ERROR_FAMILY.BOT_DETECTION).toBe('bot-detection');
    });

    test('TIMEOUT is "timeout"', () => {
        expect(TURNSTILE_ERROR_FAMILY.TIMEOUT).toBe('timeout');
    });

    test('OTHER is "other"', () => {
        expect(TURNSTILE_ERROR_FAMILY.OTHER).toBe('other');
    });
});

describe('classifyTurnstileErrorCode', () => {
    describe('infrastructure (200xxx / 500xxx)', () => {
        test.each([
            ['200500'],
            ['200100'],
            ['200000'],
            ['500000'],
            ['500100'],
            ['500999'],
        ])('classifies %s as infrastructure', (code) => {
            expect(classifyTurnstileErrorCode(code)).toBe(TURNSTILE_ERROR_FAMILY.INFRASTRUCTURE);
        });
    });

    describe('bot-detection (300xxx / 600xxx)', () => {
        test.each([
            ['300010'],
            ['300000'],
            ['300999'],
            ['600000'],
            ['600100'],
        ])('classifies %s as bot-detection', (code) => {
            expect(classifyTurnstileErrorCode(code)).toBe(TURNSTILE_ERROR_FAMILY.BOT_DETECTION);
        });
    });

    describe('timeout (110xxx)', () => {
        test.each([['110000'], ['110100'], ['110999']])('classifies %s as timeout', (code) => {
            expect(classifyTurnstileErrorCode(code)).toBe(TURNSTILE_ERROR_FAMILY.TIMEOUT);
        });
    });

    describe('other (anything else)', () => {
        test.each([
            ['400000'],
            ['700000'],
            ['100000'],
            ['000000'],
            ['invalid'],
            [''],
            ['999999'],
            ['abcdef'],
        ])('classifies %s as other', (code) => {
            expect(classifyTurnstileErrorCode(code)).toBe(TURNSTILE_ERROR_FAMILY.OTHER);
        });
    });
});
