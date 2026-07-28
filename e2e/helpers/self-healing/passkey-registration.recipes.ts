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

import type { HealingRecipe } from './types';

/**
 * Passkey Registration Modal - Dialog for OTP + WebAuthn registration
 * Primary: [data-testid="passkey-registration-modal"]
 */
export const passkeyModalRecipe: HealingRecipe = {
    name: 'modal',
    description: 'Passkey registration modal dialog',
    selectors: [
        '[data-testid="passkey-registration-modal"]', // Primary
        '[role="dialog"]:has-text("passkey")', // ARIA role + text
        '[role="dialog"]:has-text("Passkey")', // Capitalized variant
    ],
    context: 'Modal dialog for entering OTP and completing WebAuthn passkey registration',
    fallbackStrategy: 'Look for a dialog role element with passkey-related text',
};

/**
 * Passkey Name Input - Text input for naming a passkey on the modal's first step
 * Primary: #passkey-name
 */
export const passkeyNameInputRecipe: HealingRecipe = {
    name: 'passkeyNameInput',
    description: 'Text input for naming a passkey before it is created',
    selectors: [
        '#passkey-name', // Primary
        '[data-testid="passkey-registration-modal"] input[type="text"]', // Type fallback
        'label:has-text("Passkey name") + input', // Label-adjacent fallback
    ],
    context: 'First step of the passkey registration modal, before the OTP step',
    fallbackStrategy: 'Look for a text input near a "Passkey name" label inside the registration modal',
};

/**
 * Name Step Continue Button - Submits the chosen name and advances to the OTP step
 * Primary: [data-testid="passkey-registration-modal"] button:has-text("Continue")
 */
export const passkeyNameContinueButtonRecipe: HealingRecipe = {
    name: 'nameStepContinueButton',
    description: 'Button that submits the chosen passkey name and advances to the OTP step',
    selectors: [
        '[data-testid="passkey-registration-modal"] button:has-text("Continue")', // Primary
        'button:has-text("Continue")', // Text fallback
    ],
    context: 'Rendered below the passkey name input on the name step',
    fallbackStrategy: 'Look for a "Continue" button inside the registration modal',
};

/**
 * Passkey OTP Inputs - Numeric OTP entry slots inside the registration modal
 * Primary: [data-testid="passkey-registration-modal"] input[inputmode="numeric"]
 */
export const passkeyOtpInputsRecipe: HealingRecipe = {
    name: 'otpInputs',
    description: 'One-time passcode input slots inside the passkey registration modal',
    selectors: [
        '[data-testid="passkey-registration-modal"] input[inputmode="numeric"]', // Primary
        '[role="dialog"] input[inputmode="numeric"]', // ARIA role fallback
        '[role="dialog"] input[maxlength="1"]', // Single-digit OTP slot pattern
        '[role="dialog"] input[autocomplete="one-time-code"]', // Autocomplete attribute
    ],
    context: 'OTP entry fields inside the passkey registration modal, one digit per input',
    fallbackStrategy: 'Look for numeric-mode inputs inside the passkey dialog',
};

/**
 * Passkey Modal Error Message - Validation/API error alert inside the modal
 * Primary: [data-testid="passkey-registration-modal"] [role="alert"]
 */
export const passkeyErrorMessageRecipe: HealingRecipe = {
    name: 'errorMessage',
    description: 'Error message alert inside the passkey registration modal',
    selectors: [
        '[data-testid="passkey-registration-modal"] [role="alert"]', // Primary
        '[role="dialog"] [role="alert"]', // ARIA role fallback
        '[role="dialog"] .text-destructive', // Error styling fallback
    ],
    context: 'Shown inside the passkey modal when OTP validation or WebAuthn ceremony fails',
    fallbackStrategy: 'Look for an alert role element inside the passkey dialog',
};

/**
 * Passkey Modal Verifying Status - Status indicator shown while verifying
 * Primary: [data-testid="passkey-registration-modal"] [role="status"]
 */
export const passkeyVerifyingStatusRecipe: HealingRecipe = {
    name: 'verifyingStatus',
    description: 'Verifying status indicator inside the passkey registration modal',
    selectors: [
        '[data-testid="passkey-registration-modal"] [role="status"]', // Primary
        '[role="dialog"] [role="status"]', // ARIA role fallback
        '[role="dialog"]:has-text("Verifying")', // Text fallback
    ],
    context: 'Shown inside the passkey modal while the OTP/WebAuthn verification is in progress',
    fallbackStrategy: 'Look for a status role element or "Verifying" text inside the passkey dialog',
};

/**
 * Passkey Modal Resend Button - Resend OTP code button
 * Primary: [data-testid="passkey-registration-modal"] button:has-text("Resend")
 */
export const passkeyResendButtonRecipe: HealingRecipe = {
    name: 'resendButton',
    description: 'Resend OTP code button inside the passkey registration modal',
    selectors: [
        '[data-testid="passkey-registration-modal"] button:has-text("Resend")', // Primary
        '[role="dialog"] button:has-text("Resend")', // ARIA role fallback
        '[role="dialog"] button:has-text("resend")', // Lowercase variant
    ],
    context: 'Lets the shopper request a new OTP code inside the passkey modal',
    fallbackStrategy: 'Look for a button with resend-related text inside the passkey dialog',
};

/**
 * Passkey Upsell Toast - Sonner toast prompting a registered shopper to add a passkey
 * Primary: [data-sonner-toast].passkey-upsell-toast
 */
export const passkeyUpsellToastRecipe: HealingRecipe = {
    name: 'upsellToast',
    description: 'Toast prompting a registered shopper without a passkey to register one',
    selectors: [
        '[data-sonner-toast].passkey-upsell-toast', // Primary
        '[data-sonner-toast]:has-text("passkey")', // Text fallback
        '[data-sonner-toast]:has-text("Passkey")', // Capitalized variant
    ],
    context: 'Appears once per browser session for a registered shopper with no passkey on file',
    fallbackStrategy: 'Look for a sonner toast element mentioning "passkey"',
};

/**
 * Passkey Upsell Toast Action Button - Opens the registration modal from the upsell toast
 * Primary: [data-sonner-toast].passkey-upsell-toast button[data-button]
 */
export const passkeyUpsellToastActionRecipe: HealingRecipe = {
    name: 'upsellToastAction',
    description: 'Action button on the passkey upsell toast that opens the registration modal',
    selectors: [
        '[data-sonner-toast].passkey-upsell-toast button[data-button]', // Primary
        '[data-sonner-toast]:has-text("passkey") button', // Text-scoped fallback
    ],
    context: 'Clicking this button on the upsell toast opens the passkey registration modal',
    fallbackStrategy: 'Look for a button inside the passkey upsell toast',
};

/**
 * Passkey Success Toast - Sonner toast shown after registration completes
 * Primary: [data-sonner-toast].passkey-success-toast
 */
export const passkeySuccessToastRecipe: HealingRecipe = {
    name: 'successToast',
    description: 'Toast confirming a passkey was successfully registered',
    selectors: [
        '[data-sonner-toast].passkey-success-toast', // Primary
        '[data-sonner-toast][data-type="success"]:has-text("passkey")', // Type + text fallback
        '[data-sonner-toast][data-type="success"]:has-text("Passkey")', // Capitalized variant
    ],
    context: 'Should appear immediately after the WebAuthn registration ceremony completes',
    fallbackStrategy: 'Look for a success-type sonner toast mentioning "passkey"',
};

export const passkeyRegistrationRecipes: HealingRecipe[] = [
    passkeyModalRecipe,
    passkeyNameInputRecipe,
    passkeyNameContinueButtonRecipe,
    passkeyOtpInputsRecipe,
    passkeyErrorMessageRecipe,
    passkeyVerifyingStatusRecipe,
    passkeyResendButtonRecipe,
    passkeyUpsellToastRecipe,
    passkeyUpsellToastActionRecipe,
    passkeySuccessToastRecipe,
];
