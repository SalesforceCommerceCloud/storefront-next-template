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
 * Account Payment Methods Page Object
 * Encapsulates interactions with the account payment methods page at /account/payment-methods
 *
 * Features:
 * - View saved payment methods
 * - Add new payment methods
 * - Remove payment methods
 * - Set default payment method
 */
class AccountPaymentMethodsPage {
    locators = {
        pageTitle: locate('h1').withText('Payment Methods').as('Page Title'),
        addPaymentMethodButton: locate('button').withText('Add Payment Method').as('Add Payment Method Button'),
        addDialog: locate('[role="dialog"]').as('Add Payment Method Dialog'),
        addDialogTitle: locate('[data-slot="dialog-title"]').withText('Add Payment Method').as('Add Dialog Title'),
        cardholderNameField: locate('[role="dialog"] input[name="cardholderName"]').as('Cardholder Name Field'),
        cardNumberField: locate('[role="dialog"] input[name="cardNumber"]').as('Card Number Field'),
        expiryDateField: locate('[role="dialog"] input[name="expiryDate"]').as('Expiry Date Field'),
        cvvField: locate(
            '[role="dialog"] input[name="cvv"], [role="dialog"] input[name="securityCode"], [role="dialog"] input[name="cvn"]'
        ).as('CVV Field'),
        billingAddressSelect: locate('[role="dialog"] select#billing-address').as('Billing Address Select'),
        saveAsDefaultCheckbox: locate('[role="dialog"] label')
            .withText('Save as default payment')
            .as('Save As Default Checkbox'),
        saveButton: locate('[role="dialog"] button').withText('Save').as('Save Button'),
        cancelButton: locate('[role="dialog"] button').withText('Cancel').as('Cancel Button'),
        successToast: locate('[data-sonner-toast][data-type="success"]').as('Success Toast'),
        paymentMethodCards: locate('button').withText('Set Default').as('Payment Method Set Default Buttons'),
    };

    navigate(url: string = '/account/payment-methods'): void {
        I.amOnPage(buildSitePath(url));
        I.waitForElement(this.locators.pageTitle, 30);
        I.waitForElement(this.locators.addPaymentMethodButton);
    }

    validatePageLoaded(): void {
        I.seeElement(this.locators.pageTitle);
        I.see('Payment Methods');
        I.seeElement(this.locators.addPaymentMethodButton);
    }

    clickAddPaymentMethod(): void {
        I.click(this.locators.addPaymentMethodButton);
        I.waitForElement(this.locators.addDialog, 5);
    }

    clickSavePaymentMethod(): void {
        I.click(this.locators.saveButton);
    }

    validateSuccessToast(): void {
        I.waitForElement(this.locators.successToast, 10);
    }

    /**
     * Add a payment method with the provided card data.
     * Requires at least one address to exist (select from billing address dropdown).
     *
     * @param data - Payment method data
     * @param addressOptionText - Visible text to select from billing address dropdown (e.g., "Test User - 100 Test Street, Boston...")
     */
    addPaymentMethod(
        data: {
            cardholderName: string;
            cardNumber: string;
            expiryDate: string;
            cvv: string;
        },
        addressOptionText: string
    ): void {
        this.clickAddPaymentMethod();
        I.fillField(this.locators.cardholderNameField, data.cardholderName);
        I.fillField(this.locators.cardNumberField, data.cardNumber);
        I.fillField(this.locators.expiryDateField, data.expiryDate);
        I.fillField(this.locators.cvvField, data.cvv);
        I.selectOption(this.locators.billingAddressSelect, addressOptionText);
        I.click(this.locators.saveAsDefaultCheckbox);
        this.clickSavePaymentMethod();
        this.validateSuccessToast();
        I.waitForInvisible(this.locators.addDialog, 10);
    }

    /**
     * Get count of saved payment method cards (cards with "Set Default" or "Remove" buttons)
     */
    async getPaymentMethodCount(): Promise<number> {
        const count = await I.grabNumberOfVisibleElements(this.locators.paymentMethodCards);
        return count;
    }
}

export = new AccountPaymentMethodsPage();
