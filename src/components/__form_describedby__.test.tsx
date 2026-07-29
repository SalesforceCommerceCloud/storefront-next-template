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

import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { useEffect } from 'react';
import { describe, it, expect } from 'vitest';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

type FieldValues = { test: string };

/**
 * Test that aria-describedby properly composes description and error message IDs.
 * This prevents regressions where:
 * - FormDescription is rendered but not referenced (BUG 1)
 * - aria-describedby points to non-existent elements
 */
describe('Form aria-describedby composition', () => {
    it('includes description ID when FormDescription is rendered', () => {
        function TestForm() {
            const form = useForm<FieldValues>({ defaultValues: { test: '' } });
            return (
                <Form {...form}>
                    <FormField
                        control={form.control}
                        name="test"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Test Field</FormLabel>
                                <FormControl>
                                    <Input data-testid="test-input" {...field} />
                                </FormControl>
                                <FormDescription data-testid="test-description">This is a description</FormDescription>
                            </FormItem>
                        )}
                    />
                </Form>
            );
        }

        render(<TestForm />);
        const input = screen.getByTestId('test-input');
        const description = screen.getByTestId('test-description');
        const describedBy = input.getAttribute('aria-describedby');

        // The input must reference the description
        expect(describedBy).toBeTruthy();
        expect(describedBy).toContain(description.id);
        // The description ID must resolve to a real element
        expect(document.getElementById(description.id)).toBe(description);
    });

    it('includes both description and error message IDs on error', () => {
        function TestForm() {
            const form = useForm<FieldValues>({ defaultValues: { test: '' } });

            useEffect(() => {
                form.setError('test', { type: 'manual', message: 'Test error' });
            }, [form]);

            return (
                <Form {...form}>
                    <FormField
                        control={form.control}
                        name="test"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Test Field</FormLabel>
                                <FormControl>
                                    <Input data-testid="test-input" {...field} />
                                </FormControl>
                                <FormDescription data-testid="test-description">This is a description</FormDescription>
                                <FormMessage data-testid="test-message" />
                            </FormItem>
                        )}
                    />
                </Form>
            );
        }

        render(<TestForm />);
        const input = screen.getByTestId('test-input');
        const description = screen.getByTestId('test-description');
        const message = screen.getByTestId('test-message');
        const describedBy = input.getAttribute('aria-describedby');

        // The input must reference both the description and the error message
        expect(describedBy).toBeTruthy();
        expect(describedBy).toContain(description.id);
        expect(describedBy).toContain(message.id);
        // Both IDs must resolve to real elements
        expect(document.getElementById(description.id)).toBe(description);
        expect(document.getElementById(message.id)).toBe(message);
    });

    it('excludes description ID when no FormDescription is rendered', () => {
        function TestForm() {
            const form = useForm<FieldValues>({ defaultValues: { test: '' } });
            return (
                <Form {...form}>
                    <FormField
                        control={form.control}
                        name="test"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Test Field</FormLabel>
                                <FormControl>
                                    <Input data-testid="test-input" {...field} />
                                </FormControl>
                            </FormItem>
                        )}
                    />
                </Form>
            );
        }

        render(<TestForm />);
        const input = screen.getByTestId('test-input');
        const describedBy = input.getAttribute('aria-describedby');

        // No description, no error → no aria-describedby (no dangling refs)
        expect(describedBy).toBeNull();
    });

    it('only includes error message ID when no description but error exists', () => {
        function TestForm() {
            const form = useForm<FieldValues>({ defaultValues: { test: '' } });

            useEffect(() => {
                form.setError('test', { type: 'manual', message: 'Test error' });
            }, [form]);

            return (
                <Form {...form}>
                    <FormField
                        control={form.control}
                        name="test"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Test Field</FormLabel>
                                <FormControl>
                                    <Input data-testid="test-input" {...field} />
                                </FormControl>
                                <FormMessage data-testid="test-message" />
                            </FormItem>
                        )}
                    />
                </Form>
            );
        }

        render(<TestForm />);
        const input = screen.getByTestId('test-input');
        const message = screen.getByTestId('test-message');
        const describedBy = input.getAttribute('aria-describedby');

        // The input must reference only the error message
        expect(describedBy).toBeTruthy();
        expect(describedBy).toBe(message.id);
        // The message ID must resolve to a real element
        expect(document.getElementById(message.id)).toBe(message);
    });
});
