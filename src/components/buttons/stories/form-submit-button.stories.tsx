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
import { FormSubmitButton } from '../form-submit-button';
import { Form, useFetcher } from 'react-router';
import { action } from 'storybook/actions';
import { useEffect, useMemo, useRef, type ReactNode, type ReactElement } from 'react';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';

const FORM_HARNESS_ATTR = 'data-form-submit-harness';

function FormSubmitStoryHarness({ children }: { children: ReactNode }): ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const logSubmit = useMemo(() => action('form-submit-clicked'), []);
    const logHover = useMemo(() => action('form-submit-hovered'), []);

    useEffect(() => {
        const isInsideHarness = (element: Element | null) => Boolean(element?.closest(`[${FORM_HARNESS_ATTR}]`));

        const handleClick = (event: MouseEvent) => {
            const button = (event.target as HTMLElement | null)?.closest('button[type="submit"]');
            if (!button || !(button instanceof HTMLButtonElement) || !isInsideHarness(button)) {
                return;
            }
            const label = (button.getAttribute('aria-label') ?? button.textContent ?? '').trim();
            if (!label) {
                return;
            }
            event.preventDefault();
            logSubmit({ label, disabled: button.disabled });
        };

        const handleMouseOver = (event: MouseEvent) => {
            const button = (event.target as HTMLElement | null)?.closest('button[type="submit"]');
            if (!button || !(button instanceof HTMLButtonElement) || !isInsideHarness(button)) {
                return;
            }
            const related = event.relatedTarget as HTMLElement | null;
            if (related && button.contains(related)) {
                return;
            }
            const label = (button.getAttribute('aria-label') ?? button.textContent ?? '').trim();
            if (!label) {
                return;
            }
            logHover({ label });
        };

        document.addEventListener('click', handleClick, true);
        document.addEventListener('mouseover', handleMouseOver, true);
        return () => {
            document.removeEventListener('click', handleClick, true);
            document.removeEventListener('mouseover', handleMouseOver, true);
        };
    }, [logSubmit, logHover]);

    return (
        <div ref={containerRef} {...{ [FORM_HARNESS_ATTR]: 'true' }}>
            {children}
        </div>
    );
}

const meta: Meta<typeof FormSubmitButton> = {
    title: 'Core/Actions/Form Submit Button',
    component: FormSubmitButton,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
A submit button component that automatically shows loading state during form submission. This component integrates seamlessly with React Router forms and provides visual feedback during submission.

## Features

- **Automatic loading state**: Displays spinner and custom text during submission
- **Auto-disable**: Prevents duplicate submissions by disabling during submission
- **React Router integration**: Works with both Form (with navigation) and Fetcher.Form (without navigation)
- **Accessibility**: Proper disabled states and ARIA attributes
- **Customizable styling**: Supports className prop for custom styling

## Usage

### Single Form with Navigation (Most Common)

\`\`\`tsx
import { Form } from 'react-router';
import { FormSubmitButton } from '../form-submit-button';

function LoginPage() {
  return (
    <Form method="post">
      <input name="email" type="email" required />
      <input name="password" type="password" required />
      <FormSubmitButton
        defaultText="Sign In"
        submittingText="Signing in..."
      />
    </Form>
  );
}
\`\`\`

### Multiple Forms with Independent States (Using Fetcher)

\`\`\`tsx
import { useFetcher } from 'react-router';
import { FormSubmitButton } from '../form-submit-button';

function AccountSettings() {
  const emailFetcher = useFetcher();
  const passwordFetcher = useFetcher();

  return (
    <>
      <emailFetcher.Form method="post" action="/account/update-email">
        <input name="email" type="email" />
        <FormSubmitButton
          fetcher={emailFetcher}
          defaultText="Update Email"
          submittingText="Updating..."
        />
      </emailFetcher.Form>

      <passwordFetcher.Form method="post" action="/account/update-password">
        <input name="password" type="password" />
        <FormSubmitButton
          fetcher={passwordFetcher}
          defaultText="Update Password"
          submittingText="Updating..."
        />
      </passwordFetcher.Form>
    </>
  );
}
\`\`\`

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| \`submittingText\` | \`string\` | - | Text displayed while the form is being submitted |
| \`defaultText\` | \`string\` | - | Text displayed when the form is idle |
| \`className\` | \`string\` | \`'w-full'\` | Additional CSS classes to apply to the button |
| \`disabled\` | \`boolean\` | \`false\` | Whether the button should be disabled (in addition to auto-disable during submission) |
| \`fetcher\` | \`Fetcher\` | \`undefined\` | Optional fetcher for independent form submission state |

## Visual States

- **Idle**: Shows default text, button is enabled
- **Submitting**: Shows spinner + submitting text, button is disabled
- **Disabled**: Button is disabled (when disabled prop is true or during submission)

## Accessibility

- Proper button type (submit)
- Disabled state during submission prevents multiple clicks
- Loading state announced to screen readers
- Keyboard navigation support
                `,
            },
        },
    },
    argTypes: {
        submittingText: {
            control: 'text',
            description: 'Text displayed while the form is being submitted',
            table: {
                type: { summary: 'string' },
            },
        },
        defaultText: {
            control: 'text',
            description: 'Text displayed when the form is idle',
            table: {
                type: { summary: 'string' },
            },
        },
        className: {
            control: 'text',
            description: 'Additional CSS classes to apply to the button',
            table: {
                type: { summary: 'string' },
                defaultValue: { summary: "'w-full'" },
            },
        },
        disabled: {
            control: 'boolean',
            description: 'Whether the button should be disabled',
            table: {
                type: { summary: 'boolean' },
                defaultValue: { summary: 'false' },
            },
        },
    },
    args: {
        defaultText: 'Submit',
        submittingText: 'Submitting...',
        className: 'w-full',
        disabled: false,
    },
    decorators: [
        (Story) => (
            <FormSubmitStoryHarness>
                <Story />
            </FormSubmitStoryHarness>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        defaultText: 'Submit',
        submittingText: 'Submitting...',
    },
    render: (args) => (
        <Form method="post" action="/submit">
            <input name="email" type="email" placeholder="Email" className="mb-4 p-2 border rounded" />
            <FormSubmitButton {...args} />
        </Form>
    ),
    parameters: {
        docs: {
            description: {
                story: `
The default FormSubmitButton shows standard submit behavior:

### Features:
- **Default text**: "Submit" when idle
- **Submitting text**: "Submitting..." with spinner during submission
- **Full width**: Uses default w-full className
- **Form integration**: Works with React Router Form component

### Use Cases:
- Standard form submissions
- Login/signup forms
- Contact forms
- Most common form scenarios
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Test button is present and properly rendered
        const submitButton = canvas.getByRole('button', { name: /submit/i });
        await expect(submitButton).toBeInTheDocument();
        await expect(submitButton).toHaveAttribute('type', 'submit');
        await expect(submitButton).not.toBeDisabled();

        // Test form input is present
        const emailInput = canvas.getByPlaceholderText(/email/i);
        await expect(emailInput).toBeInTheDocument();
    },
};

function FetcherFormExample(args: React.ComponentProps<typeof FormSubmitButton>) {
    const fetcher = useFetcher();

    return (
        <fetcher.Form method="post" action="/update-settings">
            <input name="setting" type="text" placeholder="Setting value" className="mb-4 p-2 border rounded" />
            <FormSubmitButton {...args} fetcher={fetcher} />
        </fetcher.Form>
    );
}

export const WithFetcher: Story = {
    args: {
        defaultText: 'Update Settings',
        submittingText: 'Updating...',
    },
    render: (args) => <FetcherFormExample {...args} />,
    parameters: {
        docs: {
            description: {
                story: `
This story demonstrates the FormSubmitButton with a fetcher for independent form state:

### Fetcher Features:
- **Independent state**: Form state doesn't affect page navigation
- **Multiple forms**: Can have multiple forms on the same page with independent states
- **Background operations**: Form submission doesn't cause navigation
- **Same visual feedback**: Loading state works the same way

### Use Cases:
- Settings pages with multiple forms
- Add to cart buttons
- Update operations that stay on the same page
- Background form submissions
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Test button is present
        const submitButton = canvas.getByRole('button', { name: /update settings/i });
        await expect(submitButton).toBeInTheDocument();
        await expect(submitButton).not.toBeDisabled();
    },
};
