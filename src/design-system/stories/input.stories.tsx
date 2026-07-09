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
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * `UI/Input` — the design-system reference for the shadcn `Input` primitive.
 *
 * The primitive is imported from the shared UI primitives, never modified
 * here. This is a **multi-state gallery**: one story renders every state the
 * input supports — empty, placeholder, filled, disabled, read-only, and invalid
 * (`aria-invalid`) — side by side in a single snapshot, so a restyle regression
 * shows up in one image.
 *
 * Each field is paired with its `Label` so the label styling is captured too.
 * The `:focus-visible` state is omitted: it can't be forced deterministically in
 * a static snapshot and would flake.
 */

/** One labeled field cell. `invalid` toggles the `aria-invalid` styling. */
function Field({
    label,
    hint,
    invalid,
    ...props
}: React.ComponentProps<typeof Input> & { label: string; hint?: string; invalid?: boolean }) {
    return (
        <div className="space-y-2">
            <Label htmlFor={props.id}>{label}</Label>
            <Input aria-invalid={invalid} {...props} />
            {hint ? (
                <p className={`text-sm ${invalid ? 'text-destructive' : 'text-muted-foreground'}`}>{hint}</p>
            ) : null}
        </div>
    );
}

const meta: Meta<typeof Input> = {
    title: 'UI/Input',
    component: Input,
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Multi-state gallery for the `Input` primitive: empty, placeholder, filled, disabled, read-only, and invalid (`aria-invalid`) states in one snapshot, each paired with its `Label`. The focus-visible state is omitted (not deterministic in a static snapshot). The primitive is imported from the shared UI primitives and is not modified here.',
            },
        },
    },
    tags: ['autodocs', 'chromatic-core'],
};

export default meta;
type Story = StoryObj<typeof Input>;

/** Every input state, in a single snapshot. */
export const Gallery: Story = {
    render: () => (
        <div className="mx-auto grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
            <Field id="input-default" label="Default" placeholder="" defaultValue="" />
            <Field id="input-placeholder" label="Placeholder" placeholder="you@example.com" />
            <Field id="input-filled" label="Filled" defaultValue="Jane Appleseed" />
            <Field id="input-email" label="Email" type="email" defaultValue="jane@example.com" />
            <Field id="input-disabled" label="Disabled" defaultValue="Can’t edit this" disabled />
            <Field id="input-readonly" label="Read-only" defaultValue="Read-only value" readOnly />
            <Field
                id="input-invalid"
                label="Invalid"
                defaultValue="not-an-email"
                invalid
                hint="Enter a valid email address."
            />
            <Field id="input-password" label="Password" type="password" defaultValue="supersecret" />
        </div>
    ),
};
