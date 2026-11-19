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
/** @sfdc-extension-file SFDC_EXT_STORE_LOCATOR */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SaveStatus } from '../save-status';

const meta: Meta<typeof SaveStatus> = {
    title: 'Account/Store Preferences/Save Status',
    component: SaveStatus,
    tags: ['autodocs', 'sfdc-ext-store-locator'],
    parameters: { layout: 'centered' },
    args: { pending: false, result: undefined },
};

export default meta;
type Story = StoryObj<typeof SaveStatus>;

/** Nothing to report yet. */
export const Idle: Story = {};

/** Save in flight, announced politely. */
export const Saving: Story = { args: { pending: true } };

/** Success, announced only after the profile readback. */
export const Saved: Story = { args: { result: { success: true } } };

/** Failure, announced through the alert region. */
export const Failed: Story = { args: { result: { success: false, code: 'DEFAULT_SAVE_FAILED' } } };
