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

import { buildSitePath } from '../utils/url-utils';

const { I } = inject();

/**
 * Account Passkeys Page Object
 * Encapsulates interactions with the account passkeys page at /account/passkeys
 *
 * Features:
 * - View registered passkeys
 * - Delete a single passkey (with confirmation dialog)
 * - Open the "Add Passkey" registration modal
 */
class AccountPasskeysPage {
    locators = {
        pageTitle: locate('h1').withText('Passkeys').as('Page Title'),
        addPasskeyButton: locate('button').withText('Add Passkey').as('Add Passkey Button'),
        passkeyCards: locate('[data-slot="card"]')
            .find('button[aria-label*="Delete passkey"]')
            .as('Passkey Delete Buttons'),
        emptyStateText: locate('p').withText('No Saved Passkeys').as('Empty State Text'),

        deleteDialog: locate('[role="dialog"]').withText('Remove passkey?').as('Delete Passkey Dialog'),
        deleteDialogConfirmButton: locate('[role="dialog"] button').withText('Remove').as('Delete Confirm Button'),
        deleteDialogCancelButton: locate('[role="dialog"] button').withText('Cancel').as('Delete Cancel Button'),

        registrationModal: locate('[data-testid="passkey-registration-modal"]').as('Passkey Registration Modal'),
        passkeyNameInput: locate('#passkey-name').as('Passkey Name Input'),
        nameStepContinueButton: locate('[data-testid="passkey-registration-modal"] button')
            .withText('Continue')
            .as('Name Step Continue Button'),
        otpCodeInput: locate('[data-testid="passkey-registration-modal"] input[inputmode="numeric"]')
            .first()
            .as('OTP Code Input'),

        successToast: locate('[data-sonner-toast][data-type="success"]').as('Success Toast'),
    };

    navigate(url: string = '/account/passkeys'): void {
        I.amOnPage(buildSitePath(url));
        I.waitForElement(this.locators.pageTitle, 30);
    }

    validatePageLoaded(): void {
        I.seeElement(this.locators.pageTitle);
        I.see('Passkeys');
    }

    validateEmptyState(): void {
        I.seeElement(this.locators.emptyStateText);
    }

    /**
     * The "Add Passkey" entry point is part of the page chrome, which renders regardless of
     * whether the credential list resolves — so this assertion doesn't depend on the SLAS
     * passkey lookup succeeding against the test tenant.
     */
    validateAddPasskeyAvailable(): void {
        I.seeElement(this.locators.addPasskeyButton);
    }

    /** Get count of registered passkey cards, keyed off each card's delete button. */
    async getPasskeyCount(): Promise<number> {
        return await I.grabNumberOfVisibleElements(this.locators.passkeyCards);
    }

    clickAddPasskey(): void {
        I.click(this.locators.addPasskeyButton);
        I.waitForElement(this.locators.registrationModal, 10);
    }

    validateRegistrationModalOpen(): void {
        I.seeElement(this.locators.registrationModal);
    }

    /** Registration modal opens on the "name your passkey" step, before any OTP is sent. */
    validateNameStepOpen(): void {
        I.seeElement(this.locators.passkeyNameInput);
    }

    /** Fill in a passkey nickname and advance to the OTP step (triggers the authorize-registration request). */
    enterPasskeyNameAndContinue(name: string): void {
        I.fillField(this.locators.passkeyNameInput, name);
        I.click(this.locators.nameStepContinueButton);
    }

    /** Modal has advanced past the name step to OTP entry. */
    validateOtpStepOpen(): void {
        I.seeElement(this.locators.otpCodeInput);
    }

    /** Click the delete button on a specific passkey card, located by its nickname text. */
    clickDeletePasskeyByName(name: string): void {
        I.click(locate('[data-slot="card"]').withText(name).find(`button[aria-label*="${name}"]`));
        I.waitForElement(this.locators.deleteDialog, 5);
    }

    confirmDeletePasskey(): void {
        I.click(this.locators.deleteDialogConfirmButton);
        I.waitForInvisible(this.locators.deleteDialog, 10);
    }

    cancelDeletePasskey(): void {
        I.click(this.locators.deleteDialogCancelButton);
        I.waitForInvisible(this.locators.deleteDialog, 5);
    }

    validateSuccessToast(): void {
        I.waitForElement(this.locators.successToast, 10);
    }
}

export = new AccountPasskeysPage();
