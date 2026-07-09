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
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * `UI/Dialog` — the design-system reference for the shadcn `Dialog` primitive.
 *
 * The primitive is imported from the shared UI primitives, never modified
 * here. A dialog renders into a **portal** with `position: fixed`, so the two
 * stories differ deliberately:
 *
 *   1. **Open** — renders with `defaultOpen`, so the full modal (overlay, header,
 *      title, description, body, footer, close button) is captured in one
 *      snapshot. This is the visual-regression surface.
 *   2. **Trigger** — renders closed with an "Open dialog" button, showing the
 *      real production pattern (a trigger owns the open state) for the docs page.
 *
 * The open story uses `docs.story.inline: false` so the fixed-position modal
 * isn't clipped by the autodocs preview block.
 */

/** Shared modal body, reused by both stories. */
function ExampleDialogContent() {
    return (
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Edit profile</DialogTitle>
                <DialogDescription>
                    Update your account details. Changes are saved when you click Save.
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
                <div className="grid gap-2">
                    <Label htmlFor="dialog-name">Name</Label>
                    <Input id="dialog-name" defaultValue="Jane Appleseed" />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="dialog-email">Email</Label>
                    <Input id="dialog-email" type="email" defaultValue="jane@example.com" />
                </div>
            </div>
            <DialogFooter>
                <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button>Save changes</Button>
            </DialogFooter>
        </DialogContent>
    );
}

const meta: Meta<typeof Dialog> = {
    title: 'UI/Dialog',
    component: Dialog,
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Reference for the `Dialog` primitive. The **Open** story renders the modal expanded (via `defaultOpen`) so the full surface — overlay, header, title, description, body, footer, close button — is captured in one snapshot. The **Trigger** story shows the closed production pattern. The primitive is imported from the shared UI primitives and is not modified here.',
            },
        },
    },
    tags: ['autodocs', 'chromatic-core'],
};

export default meta;
type Story = StoryObj<typeof Dialog>;

/** The modal rendered open — the visual-regression surface (one snapshot). */
export const Open: Story = {
    parameters: {
        // Portal + `position: fixed`: render out-of-line so autodocs doesn't clip it.
        docs: { story: { inline: false, height: '520px' } },
    },
    render: () => (
        <Dialog defaultOpen>
            <ExampleDialogContent />
        </Dialog>
    ),
};

/** The production pattern: a trigger owns the open state; dialog starts closed. */
export const Trigger: Story = {
    parameters: {
        // Closed state is a bare trigger button — a low-value baseline. Keep the
        // story for the docs page, but skip its Chromatic snapshot so this file
        // contributes only the meaningful `Open` image.
        chromatic: { disableSnapshot: true },
        docs: {
            description: {
                story: 'Closed by default. Click the trigger to open — mirrors real usage where a parent owns the open state.',
            },
        },
    },
    render: () => (
        <Dialog>
            <DialogTrigger asChild>
                <Button>Open dialog</Button>
            </DialogTrigger>
            <ExampleDialogContent />
        </Dialog>
    ),
};
