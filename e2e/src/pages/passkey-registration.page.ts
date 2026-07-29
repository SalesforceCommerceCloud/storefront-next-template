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

const { I } = inject();

/**
 * Passkey Registration Page Object
 * Encapsulates interactions with `PasskeyRegistrationModal`
 * (`passkey-registration-modal.tsx`) and the toasts it and
 * `usePasskeyRegistration` trigger.
 */
class PasskeyRegistrationPage {
    locators = {
        modal: locate('[data-testid="passkey-registration-modal"]').as('Passkey Registration Modal'),
        passkeyNameInput: locate('#passkey-name').as('Passkey Name Input'),
        nameStepContinueButton: locate('[data-testid="passkey-registration-modal"] button')
            .withText('Continue')
            .as('Name Step Continue Button'),
        otpInputs: locate('[data-testid="passkey-registration-modal"] input[inputmode="numeric"]').as(
            'Passkey OTP Inputs'
        ),
        errorMessage: locate('[data-testid="passkey-registration-modal"] [role="alert"]').as(
            'Passkey Modal Error Message'
        ),
        verifyingStatus: locate('[data-testid="passkey-registration-modal"] [role="status"]').as(
            'Passkey Modal Verifying Status'
        ),
        resendButton: locate('[data-testid="passkey-registration-modal"] button')
            .withText('Resend')
            .as('Passkey Modal Resend Button'),
        upsellToast: locate('[data-sonner-toast].passkey-upsell-toast').as('Passkey Upsell Toast'),
        upsellToastAction: locate('[data-sonner-toast].passkey-upsell-toast button[data-button]').as(
            'Passkey Upsell Toast Action Button'
        ),
        successToast: locate('[data-sonner-toast].passkey-success-toast').as('Passkey Success Toast'),
    };

    /**
     * Types one digit into each rendered OTP slot, left to right. The modal's slot
     * count is driven by `config.auth.otpLength` (6 or 8), which can differ from
     * `code`'s length — repeats `code` to fill every rendered slot so auto-submit's
     * `enteredOtp.length === visibleCount` check is satisfied regardless of config.
     */
    async enterOtp(code: string): Promise<void> {
        const slotCount = await I.grabNumberOfVisibleElements(this.locators.otpInputs);
        const digits = code
            .repeat(Math.ceil(slotCount / code.length))
            .slice(0, slotCount)
            .split('');
        for (let index = 0; index < digits.length; index += 1) {
            I.fillField(this.locators.otpInputs.at(index + 1), digits[index]);
        }
    }

    /** Fill in a passkey nickname and advance to the OTP step (triggers the authorize-registration request). */
    enterPasskeyNameAndContinue(name: string): void {
        I.fillField(this.locators.passkeyNameInput, name);
        I.click(this.locators.nameStepContinueButton);
    }

    async isUpsellToastVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.upsellToast);
        return count > 0;
    }

    clickUpsellToastAction(): void {
        I.click(this.locators.upsellToastAction);
    }

    async isSuccessToastVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.successToast);
        return count > 0;
    }

    async isModalVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.modal);
        return count > 0;
    }

    async getErrorMessageText(): Promise<string> {
        return await I.grabTextFrom(this.locators.errorMessage);
    }
}

export = new PasskeyRegistrationPage();
