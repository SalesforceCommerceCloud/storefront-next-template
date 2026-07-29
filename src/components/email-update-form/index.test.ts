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
import { createEmailUpdateFormSchema } from './index';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

const { t } = getTranslation();

describe('createEmailUpdateFormSchema', () => {
    const schema = createEmailUpdateFormSchema(t);

    it.each(['not-an-email', '', 'user@', '@example.com', 'user@.com'])('rejects invalid email: %j', (email) => {
        const result = schema.safeParse({ currentPassword: 'pass123', email });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some((issue) => issue.path.includes('email'))).toBe(true);
        }
    });

    it('rejects when email field is missing', () => {
        const result = schema.safeParse({ currentPassword: 'pass123' });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some((issue) => issue.path.includes('email'))).toBe(true);
        }
    });

    it.each([
        'user@example.com',
        'user+tag@example.co.uk',
        'user.name@domain.org',
    ])('accepts valid email: %j', (email) => {
        const result = schema.safeParse({ currentPassword: 'pass123', email });
        expect(result.success).toBe(true);
    });

    describe('requirePassword=true (default)', () => {
        it('accepts valid currentPassword and email', () => {
            const result = schema.safeParse({ currentPassword: 'myPassword123', email: 'user@example.com' });
            expect(result.success).toBe(true);
        });

        it('rejects empty currentPassword', () => {
            const result = schema.safeParse({ currentPassword: '', email: 'user@example.com' });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues.some((issue) => issue.path.includes('currentPassword'))).toBe(true);
            }
        });

        it('rejects missing currentPassword', () => {
            const result = schema.safeParse({ email: 'user@example.com' });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues.some((issue) => issue.path.includes('currentPassword'))).toBe(true);
            }
        });
    });

    describe('requirePassword=false', () => {
        // currentPassword is z.string() (no min(1)) — present but can be empty.
        const schemaNoPassword = createEmailUpdateFormSchema(t, false);

        it('accepts empty currentPassword', () => {
            const result = schemaNoPassword.safeParse({ currentPassword: '', email: 'user@example.com' });
            expect(result.success).toBe(true);
        });
    });
});
