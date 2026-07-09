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
import { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useForm } from 'react-hook-form';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

/**
 * `UI/Form` — the design-system reference for the shadcn `Form` primitives
 * (`Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`,
 * `FormDescription`, `FormMessage`) wired to React Hook Form.
 *
 * The primitives are imported from the shared UI primitives, never modified
 * here. This is a **multi-state gallery**: one story renders the three states a
 * field moves through — empty, filled (valid), and error — side by side in a
 * single snapshot, so label / description / validation-message styling is all
 * captured at once.
 *
 * The error state is seeded with `form.setError` in an effect (not by driving a
 * submit), so the validation message renders deterministically at snapshot time
 * — no async resolver timing, no play function.
 */

type FieldValues = { email: string };

/**
 * A single email field in its own React Hook Form context. When `errorMessage`
 * is provided, the error is seeded on mount so `FormMessage` renders it.
 */
function EmailField({ defaultValue = '', errorMessage }: { defaultValue?: string; errorMessage?: string }) {
    const form = useForm<FieldValues>({ defaultValues: { email: defaultValue } });

    useEffect(() => {
        if (errorMessage) {
            form.setError('email', { type: 'manual', message: errorMessage });
        }
    }, [errorMessage, form]);

    return (
        <Form {...form}>
            <form onSubmit={(e) => e.preventDefault()}>
                <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                                <Input type="email" placeholder="you@example.com" {...field} />
                            </FormControl>
                            <FormDescription>We’ll only use this to send order updates.</FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </form>
        </Form>
    );
}

/** One labeled column wrapping a field state. */
function StateColumn({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-3">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</h3>
            {children}
        </div>
    );
}

const meta: Meta = {
    title: 'UI/Form',
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Multi-state gallery for the `Form` primitives wired to React Hook Form: empty, filled (valid), and error states in one snapshot, capturing label, description, and validation-message styling together. The error is seeded with `form.setError` so it renders deterministically. The primitives are imported from the shared UI primitives and are not modified here.',
            },
        },
    },
    tags: ['autodocs', 'chromatic-core'],
};

export default meta;
type Story = StoryObj;

/** Empty, filled, and error field states, in a single snapshot. */
export const Gallery: Story = {
    render: () => (
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-8 sm:grid-cols-3">
            <StateColumn label="Empty">
                <EmailField />
            </StateColumn>
            <StateColumn label="Filled">
                <EmailField defaultValue="jane@example.com" />
            </StateColumn>
            <StateColumn label="Error">
                <EmailField defaultValue="not-an-email" errorMessage="Enter a valid email address." />
            </StateColumn>
        </div>
    ),
};
