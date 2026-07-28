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

/**
 * Recipes for account passkeys page (/account/passkeys):
 * passkey list display, add-passkey registration modal entry point,
 * delete-one confirmation dialog.
 */

import type { HealingRecipe } from './types';

export const passkeysPageTitleRecipe: HealingRecipe = {
    name: 'pageTitle',
    description: 'Main page title "Passkeys"',
    selectors: [
        'h1:has-text("Passkeys")',
        '[role="heading"]:has-text("Passkeys")',
        'h2:has-text("Passkeys")',
        '[data-testid*="page-title"]',
    ],
    context: 'Main heading on account passkeys page',
    fallbackStrategy: 'Look for heading element with "Passkeys" text',
};

export const addPasskeyButtonRecipe: HealingRecipe = {
    name: 'addPasskeyButton',
    description: 'Button to open the passkey registration modal',
    selectors: [
        'button:has-text("Add Passkey")',
        'button[aria-label*="Add" i][aria-label*="passkey" i]',
        '[data-testid*="add-passkey"]',
    ],
    context: 'Primary button in the passkeys section header',
    fallbackStrategy: 'Look for button with "Add" and "passkey" in text or aria-label',
};

export const passkeyDeleteButtonsRecipe: HealingRecipe = {
    name: 'passkeyCards',
    description: 'Per-credential delete (trash icon) buttons on passkey cards',
    selectors: [
        '[data-slot="card"] button[aria-label*="Delete passkey"]',
        'button[aria-label*="Delete passkey" i]',
        '[data-slot="card"] button:has(svg)',
    ],
    context: 'Rendered once per registered passkey credential',
    fallbackStrategy: 'Look for an icon-only button with an aria-label mentioning "Delete passkey" inside a card',
};

export const emptyStateMessageRecipe: HealingRecipe = {
    name: 'emptyStateText',
    description: 'Empty-state message shown when the account has no registered passkeys',
    selectors: ['p:has-text("No Saved Passkeys")', '[data-testid*="empty-state"]', '[class*="empty-state"]'],
    context: 'Rendered in place of the passkey list when credentials.length === 0',
    fallbackStrategy: 'Look for text mentioning "No Saved Passkeys" in the passkeys section',
};

export const deletePasskeyDialogRecipe: HealingRecipe = {
    name: 'deleteDialog',
    description: 'Confirmation dialog for deleting a single passkey',
    selectors: [
        '[role="dialog"]:has-text("Remove passkey?")',
        '[data-slot="dialog-content"]:has-text("Remove passkey?")',
    ],
    context: 'Opened after clicking a passkey card delete button',
    fallbackStrategy: 'Look for a dialog with "Remove passkey?" in its title',
};

export const passkeyRegistrationModalRecipe: HealingRecipe = {
    name: 'registrationModal',
    description: 'Shared passkey registration modal (name step, then OTP entry step)',
    selectors: [
        '[data-testid="passkey-registration-modal"]',
        '[role="dialog"]:has-text("Name your passkey")',
        '[role="dialog"]:has-text("Verify your email")',
        '[data-slot="dialog-content"]:has-text("Name your passkey")',
        '[data-slot="dialog-content"]:has-text("Verify your email")',
    ],
    context: 'Opened after clicking "Add Passkey"; reused from the passkey registration ticket',
    fallbackStrategy: 'Look for a dialog with a name-entry step or an OTP/verification-code entry step',
};

export const passkeyNameInputRecipe: HealingRecipe = {
    name: 'passkeyNameInput',
    description: 'Text input for naming a passkey before it is created',
    selectors: [
        '#passkey-name',
        '[data-testid="passkey-registration-modal"] input[type="text"]',
        'input[placeholder*="Chrome" i]',
        'label:has-text("Passkey name") + input',
    ],
    context: 'First step of the passkey registration modal, before the OTP step',
    fallbackStrategy: 'Look for a text input near a "Passkey name" label inside the registration modal',
};

export const passkeyNameContinueButtonRecipe: HealingRecipe = {
    name: 'nameStepContinueButton',
    description: 'Button that submits the chosen passkey name and advances to the OTP step',
    selectors: [
        '[data-testid="passkey-registration-modal"] button:has-text("Continue")',
        'button:has-text("Continue")',
    ],
    context: 'Rendered below the passkey name input on the name step',
    fallbackStrategy: 'Look for a "Continue" button inside the registration modal',
};

export const passkeyOtpCodeInputRecipe: HealingRecipe = {
    name: 'otpCodeInput',
    description: 'First OTP digit input on the passkey registration modal',
    selectors: [
        '[data-testid="passkey-registration-modal"] input[inputmode="numeric"]',
        '[data-testid="passkey-registration-modal"] input[aria-label*="Verification code" i]',
    ],
    context: 'Rendered once the shopper advances past the name step',
    fallbackStrategy: 'Look for a numeric-input grid inside the registration modal',
};

/**
 * Aggregate all account passkeys recipes for easy import
 */
export const accountPasskeysRecipes: HealingRecipe[] = [
    passkeysPageTitleRecipe,
    addPasskeyButtonRecipe,
    passkeyDeleteButtonsRecipe,
    emptyStateMessageRecipe,
    deletePasskeyDialogRecipe,
    passkeyRegistrationModalRecipe,
    passkeyNameInputRecipe,
    passkeyNameContinueButtonRecipe,
    passkeyOtpCodeInputRecipe,
];
