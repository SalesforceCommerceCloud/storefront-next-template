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
 * Account Addresses Page Object
 * Encapsulates interactions with the account addresses page at /account/addresses
 *
 * Features:
 * - View saved addresses
 * - Add new addresses
 * - Edit existing addresses
 * - Delete addresses
 * - Set default/preferred address
 */
class AccountAddressesPage {
    locators = {
        // Page elements
        pageTitle: locate('h1').withText('Addresses').as('Page Title'),
        pageSubtitle: locate('p.text-muted-foreground').as('Page Subtitle'),

        // Add new address button
        addNewAddressButton: locate('button').withText('Add new address').as('Add new address Button'),

        // Empty state
        emptyStateCard: locate('[data-slot="card"]').as('Empty State Card'),
        emptyStateMessage: locate('p').withText('No Saved Addresses').as('Empty State Message'),

        // Address cards — scoped to data-testid so we don't accidentally match
        // other Card+CardFooter components (e.g. tracking-consent-banner).
        addressCards: locate('[data-testid="address-card"]').as('Address Cards'),

        // Default badge
        defaultBadge: locate('[data-slot="badge"]').withText('Default').as('Default Badge'),

        // Address card buttons
        editAddressButton: locate('button').withText('Edit Address').as('Edit Address Button'),
        removeAddressButton: locate('button').withText('Remove').as('Remove Address Button'),
        setDefaultButton: locate('button').withText('Set Default').as('Set Default Button'),

        // Add/Edit Address Dialog
        addDialog: locate('[role="dialog"]:has([data-slot="dialog-title"])').as('Add/Edit Address Dialog'),
        dialogTitle: locate('[data-slot="dialog-title"]').as('Dialog Title'),
        addDialogTitle: locate('[data-slot="dialog-title"]').withText('Add new address').as('Add Dialog Title'),
        editDialogTitle: locate('[data-slot="dialog-title"]').withText('Edit Address').as('Edit Dialog Title'),

        // Address form fields
        firstNameField: locate('input[name="firstName"]').as('First Name Field'),
        lastNameField: locate('input[name="lastName"]').as('Last Name Field'),
        phoneField: locate('input[name="phone"]').as('Phone Field'),
        countryCodeSelect: locate('select[name="countryCode"]').as('Country Code Select'),
        address1Field: locate('input[name="address1"]').as('Address 1 Field'),
        address2Field: locate('input[name="address2"]').as('Address 2 Field'),
        cityField: locate('input[name="city"]').as('City Field'),
        stateCodeSelect: locate('select[name="stateCode"]').as('State Code Select'),
        postalCodeField: locate('input[name="postalCode"]').as('Postal Code Field'),
        preferredCheckbox: locate('input[name="preferred"]').as('Preferred Checkbox'),

        // Dialog buttons
        saveButton: locate('button[type="submit"]').withText('Save').as('Save Button'),
        cancelButton: locate('button[type="button"]').withText('Cancel').as('Cancel Button'),

        // Delete Confirmation Dialog — scoped to Radix's [data-slot="dialog-content"]
        // so we don't accidentally match other [role="dialog"] elements like the
        // tracking-consent banner.
        deleteDialog: locate('[data-slot="dialog-content"]').as('Delete Confirmation Dialog'),
        deleteDialogTitle: locate('[data-slot="dialog-title"]').withText('Remove Address').as('Delete Dialog Title'),
        deleteDialogDescription: locate('p')
            .withText('Are you sure you want to remove this address')
            .as('Delete Dialog Description'),
        confirmDeleteButton: locate('[data-slot="dialog-content"] button')
            .withText('Remove')
            .as('Confirm Delete Button'),
        cancelDeleteButton: locate('[data-slot="dialog-content"] button').withText('Cancel').as('Cancel Delete Button'),
        defaultAddressWarning: locate('p').withText('This is your default address').as('Default Address Warning'),

        // Toast notifications
        successToast: locate('[data-sonner-toast][data-type="success"]').as('Success Toast'),
        errorToast: locate('[data-sonner-toast][data-type="error"]').as('Error Toast'),

        // Error messages
        formError: locate('.text-destructive').as('Form Error Message'),
    };

    /**
     * Navigate to account addresses page
     * @param url - Optional URL override (defaults to /account/addresses)
     */
    navigate(url: string = '/account/addresses'): void {
        I.amOnPage(buildSitePath(url));
    }

    /**
     * Validate that the page loaded successfully
     */
    validatePageLoaded(): void {
        I.seeElement(this.locators.pageTitle);
        I.see('Addresses');
        I.seeElement(this.locators.addNewAddressButton);
    }

    /**
     * Validate authentication requirement
     * Checks if unauthenticated users are redirected to login
     */
    async validateAuthenticationRequired(): Promise<void> {
        const currentUrl = await I.grabCurrentUrl();
        if (!currentUrl.includes('/account/addresses')) {
            // Should be redirected to login or similar
            I.waitForURL(/\/(login|signin)/, 10);
        }
    }

    /**
     * Check if empty state is visible
     * @returns Promise<boolean> - True if empty state is visible
     */
    async isEmptyStateVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.emptyStateMessage);
        return count > 0;
    }

    /**
     * Get the number of address cards displayed
     * @returns Promise<number> - Number of address cards
     */
    async getAddressCount(): Promise<number> {
        return await I.grabNumberOfVisibleElements(this.locators.addressCards);
    }

    /**
     * Click "Add New Address" button
     */
    clickAddNewAddress(): void {
        I.click(this.locators.addNewAddressButton);
        I.waitForElement(this.locators.addDialogTitle, 10);
    }

    /**
     * Fill address form with data
     * @param data - Address data to fill
     */
    fillAddressForm(data: {
        firstName: string;
        lastName: string;
        phone: string;
        countryCode?: 'US' | 'CA';
        address1: string;
        address2?: string;
        city: string;
        stateCode: string;
        postalCode: string;
        preferred?: boolean;
    }): void {
        I.fillField(this.locators.firstNameField, data.firstName);
        I.fillField(this.locators.lastNameField, data.lastName);
        I.fillField(this.locators.phoneField, data.phone);

        if (data.countryCode !== undefined) {
            I.selectOption(this.locators.countryCodeSelect, data.countryCode);
        }

        I.fillField(this.locators.address1Field, data.address1);

        if (data.address2 !== undefined) {
            I.fillField(this.locators.address2Field, data.address2);
        }

        I.fillField(this.locators.cityField, data.city);
        I.selectOption(this.locators.stateCodeSelect, data.stateCode);
        I.fillField(this.locators.postalCodeField, data.postalCode);

        if (data.preferred !== undefined && data.preferred) {
            I.checkOption(this.locators.preferredCheckbox);
        }
    }

    /**
     * Click Save button on address form
     */
    clickSaveAddress(): void {
        I.click(this.locators.saveButton);
    }

    /**
     * Click Cancel button on address form
     */
    clickCancelAddress(): void {
        I.click(this.locators.cancelButton);
    }

    /**
     * Click Edit button on a specific address card
     * @param index - Index of the address card (0-based)
     */
    clickEditAddress(index: number = 0): void {
        I.click(locate(this.locators.editAddressButton).at(index + 1));
        I.waitForElement(this.locators.editDialogTitle, 10);
    }

    /**
     * Click Remove button on a specific address card
     * @param index - Index of the address card (0-based)
     */
    clickRemoveAddress(index: number = 0): void {
        I.click(locate(this.locators.removeAddressButton).at(index + 1));
        I.waitForElement(this.locators.deleteDialogTitle, 10);
    }

    /**
     * Confirm address deletion
     */
    confirmDeleteAddress(): void {
        I.click(this.locators.confirmDeleteButton);
    }

    /**
     * Cancel address deletion
     */
    cancelDeleteAddress(): void {
        I.click(this.locators.cancelDeleteButton);
    }

    /**
     * Click "Set Default" button on a specific address card
     * @param index - Index of the address card (0-based)
     */
    clickSetDefault(index: number = 0): void {
        I.click(locate(this.locators.setDefaultButton).at(index + 1));
    }

    /**
     * Check if an address is marked as default
     * @param index - Index of the address card (0-based)
     * @returns Promise<boolean> - True if address has default badge
     */
    async isAddressDefault(index: number = 0): Promise<boolean> {
        const addressCard = locate(this.locators.addressCards).at(index + 1);
        const defaultBadges = await I.grabNumberOfVisibleElements(addressCard.find(this.locators.defaultBadge));
        return defaultBadges > 0;
    }

    /**
     * Get customer name from a specific address card
     * @param index - Index of the address card (0-based)
     * @returns Promise<string> - The customer name
     */
    async getAddressName(index: number = 0): Promise<string> {
        const card = locate(this.locators.addressCards).at(index + 1);
        const nameLocator = card.find('p.font-medium').first();
        return await I.grabTextFrom(nameLocator);
    }

    /**
     * Get the full visible text of a specific address card
     * @param index - Index of the address card (0-based)
     * @returns Promise<string> - All text content in the card
     */
    async getAddressCardText(index: number = 0): Promise<string> {
        const card = locate(this.locators.addressCards).at(index + 1);
        return await I.grabTextFrom(card);
    }

    /**
     * Check if address card exists with specific customer name
     * @param name - The customer name to search for (e.g., "John Doe")
     * @returns Promise<boolean> - True if address card with name exists
     */
    async addressExistsByName(name: string): Promise<boolean> {
        const nameLocator = locate('[data-testid="address-card"]').find('p.font-medium').withText(name);
        const count = await I.grabNumberOfVisibleElements(nameLocator);
        return count > 0;
    }

    /**
     * Get current value of form field
     * @param fieldName - Name of the form field
     * @returns Promise<string> - Current field value
     */
    async getFormFieldValue(fieldName: string): Promise<string> {
        const field = locate(`input[name="${fieldName}"], select[name="${fieldName}"]`);
        return await I.grabValueFrom(field);
    }

    /**
     * Wait for and validate success toast message
     * @param message - Optional expected message text
     */
    validateSuccessToast(message?: string): void {
        I.waitForElement(this.locators.successToast, 10);
        if (message) {
            I.see(message);
        }
    }

    /**
     * Wait for and validate error toast message
     * @param message - Optional expected message text
     */
    validateErrorToast(message?: string): void {
        I.waitForElement(this.locators.errorToast, 10);
        if (message) {
            I.see(message);
        }
    }

    /**
     * Validate that form error is displayed
     */
    validateFormError(): void {
        I.seeElement(this.locators.formError);
    }

    /**
     * Check if add/edit dialog is open
     * @returns Promise<boolean> - True if dialog is open
     */
    async isDialogOpen(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.addDialog);
        return count > 0;
    }

    /**
     * Check if delete confirmation dialog is open
     * @returns Promise<boolean> - True if delete dialog is open
     */
    async isDeleteDialogOpen(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.deleteDialog);
        return count > 0;
    }

    /**
     * Refresh the page and wait for it to load
     */
    refreshPage(): void {
        I.refreshPage();
    }

    /**
     * Create a new address with the provided data
     * This is a complete flow: click add, fill form, save, wait for success
     * @param data - Address data to create
     */
    createAddress(data: {
        firstName: string;
        lastName: string;
        phone: string;
        countryCode?: 'US' | 'CA';
        address1: string;
        address2?: string;
        city: string;
        stateCode: string;
        postalCode: string;
        preferred?: boolean;
    }): void {
        this.clickAddNewAddress();
        this.fillAddressForm(data);
        this.clickSaveAddress();
        this.validateSuccessToast();
        // Wait for dialog to close
        I.waitForInvisible(this.locators.addDialog, 5);
    }

    /**
     * Create a test address with generated data
     * @param index - Optional index to make firstName unique
     * @returns The generated address data
     */
    createTestAddress(index?: number): {
        firstName: string;
        lastName: string;
        phone: string;
        countryCode: 'US';
        address1: string;
        city: string;
        stateCode: string;
        postalCode: string;
    } {
        const suffix = index !== undefined ? `${index}` : '';
        const addressData = {
            firstName: `Test${suffix}`,
            lastName: 'User',
            phone: '5551234567',
            countryCode: 'US' as const,
            address1: `${100 + (index || 0)} Test Street`,
            city: 'Boston',
            stateCode: 'MA',
            postalCode: '02101',
        };

        this.createAddress(addressData);
        return addressData;
    }

    /**
     * Delete all addresses to ensure empty state
     */
    async deleteAllAddresses(): Promise<void> {
        let count = await this.getAddressCount();

        while (count > 0) {
            // Always delete the first address
            this.clickRemoveAddress(0);
            this.confirmDeleteAddress();
            this.validateSuccessToast();

            // Wait for the address card count to actually decrease
            const expectedCount = count - 1;
            await this.waitForAddressCount(expectedCount);

            // Get updated count
            count = await this.getAddressCount();
        }
    }

    /**
     * Poll until the visible address card count matches the expected value AND
     * each card has its inner name rendered.
     *
     * Card outer wrapper (`[data-testid="address-card"]`) and inner content
     * (`<AddressDisplay>` rendering `<p class="font-medium">`) are separate
     * React renders — the wrapper can match before the inner name paints,
     * especially right after a fetcher revalidation. Waiting only on card
     * count produced sporadic 5s timeouts in subsequent name lookups.
     */
    private async waitForAddressCount(expected: number, timeoutSeconds: number = 30): Promise<void> {
        const deadline = Date.now() + timeoutSeconds * 1000;
        while (Date.now() < deadline) {
            const cardCount = await this.getAddressCount();
            if (cardCount === expected) {
                // Card count matches — also verify inner names have rendered.
                const namedCount = await I.grabNumberOfVisibleElements(
                    locate(this.locators.addressCards).find('p.font-medium')
                );
                if (namedCount >= expected) return;
            }
            await new Promise((r) => setTimeout(r, 500));
        }
        // Re-check both conditions atomically once the deadline has elapsed —
        // the page may have stabilized between the last poll and now, and we
        // shouldn't throw if both invariants are satisfied at this final read.
        const finalCount = await this.getAddressCount();
        const finalNamed = await I.grabNumberOfVisibleElements(
            locate(this.locators.addressCards).find('p.font-medium')
        );
        if (finalCount === expected && finalNamed >= expected) return;

        if (finalCount !== expected) {
            throw new Error(
                `Timed out waiting for address count to be ${expected} (currently ${finalCount}) after ${timeoutSeconds}s`
            );
        }
        throw new Error(
            `Timed out waiting for address card names to render. Cards: ${finalCount}, named: ${finalNamed} after ${timeoutSeconds}s`
        );
    }

    /**
     * Ensure at least N addresses exist (creates if needed)
     * @param minCount - Minimum number of addresses required
     */
    async ensureMinimumAddresses(minCount: number): Promise<void> {
        const currentCount = await this.getAddressCount();
        const addressesToCreate = Math.max(0, minCount - currentCount);

        for (let i = 0; i < addressesToCreate; i++) {
            this.createTestAddress(i);
            await this.waitForAddressCount(currentCount + i + 1);
        }

        // Even when the count was already met (no addresses created), card
        // *names* may still be rendering — the page just navigated, the cards'
        // outer wrappers paint before their <AddressDisplay> children. Wait
        // for the post-condition before returning so callers can safely read
        // positional data.
        const finalCount = Math.max(currentCount, minCount);
        await this.waitForAddressCount(finalCount);
    }

    /**
     * Wait for the add/edit dialog to become invisible (i.e. closed after save/cancel)
     * @param timeout - Seconds to wait (default: 10)
     */
    waitForDialogClosed(timeout: number = 10): void {
        I.waitForInvisible(this.locators.addDialog, timeout);
    }

    /**
     * Wait for an address card with the given customer name to appear in the list
     * @param name - The customer name to look for (e.g., "John Doe")
     * @param timeout - Seconds to wait (default: 10)
     */
    waitForAddressWithName(name: string, timeout: number = 10): void {
        const nameLocator = locate('[data-testid="address-card"]').find('p.font-medium').withText(name);
        I.waitForElement(nameLocator, timeout);
    }

    /**
     * Refreshes the address page until a newly written address appears in the
     * customer read. Shopper Customers reads can briefly lag a successful write.
     *
     * @returns Whether the named address was rendered before attempts were exhausted.
     */
    async pollUntilAddressWithName(name: string, maxAttempts: number = 3): Promise<boolean> {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const nameLocator = locate('[data-testid="address-card"]').find('p.font-medium').withText(name);
                await I.waitForElement(nameLocator, 5);
                return true;
            } catch {
                // The post-write read can still be stale; refresh below before retrying.
            }

            if (attempt < maxAttempts) {
                I.refreshPage();
            }
        }

        return false;
    }

    /**
     * Wait for at least one address card to be visible (used after page refresh)
     * @param timeout - Seconds to wait (default: 15)
     */
    waitForAddressCardsVisible(timeout: number = 15): void {
        I.waitForElement(this.locators.addressCards, timeout);
    }

    /**
     * Wait for an address card with the given name to disappear from the DOM.
     *
     * Used after delete-address actions where `revalidator.revalidate()` fires alongside
     * the success toast — the toast appears before the network refetch resolves, so a
     * single immediate DOM check can race the stale render. Playwright's auto-wait
     * polls until the element is gone or the timeout elapses.
     *
     * @param name - Customer name on the address card (e.g., "John Doe")
     * @param timeout - Seconds to wait (default: 5)
     */
    waitForAddressRemoved(name: string, timeout: number = 5): void {
        const nameLocator = locate('[data-slot="card"]').find('p.font-medium').withText(name);
        I.waitForInvisible(nameLocator, timeout);
    }

    /**
     * Return the current browser URL
     * @returns Promise<string> - Current page URL
     */
    async getCurrentUrl(): Promise<string> {
        return await I.grabCurrentUrl();
    }

    /**
     * Update the city field with a new value
     * @param city - City string to enter
     */
    updateCityField(city: string): void {
        I.fillField(this.locators.cityField, city);
    }

    /**
     * Fill a subset of address form fields (for cancel/partial-fill scenarios)
     * @param data - Partial address data; only defined fields are filled
     */
    fillPartialAddressForm(data: { firstName?: string }): void {
        if (data.firstName !== undefined) {
            I.fillField(this.locators.firstNameField, data.firstName);
        }
    }

    /**
     * Ensure exactly N addresses exist (creates or deletes as needed)
     * @param exactCount - Exact number of addresses required
     */
    async ensureExactAddressCount(exactCount: number): Promise<void> {
        let currentCount = await this.getAddressCount();

        // Delete extras
        while (currentCount > exactCount) {
            // Find and delete a non-default address first
            let indexToDelete = -1;
            for (let i = 0; i < currentCount; i++) {
                const isDefault = await this.isAddressDefault(i);
                if (!isDefault) {
                    indexToDelete = i;
                    break;
                }
            }
            if (indexToDelete === -1) {
                indexToDelete = 0; // Delete first if all are default (shouldn't happen)
            }

            this.clickRemoveAddress(indexToDelete);
            this.confirmDeleteAddress();
            this.validateSuccessToast();

            // Wait for the address card count to actually decrease
            const expectedCount = currentCount - 1;
            await this.waitForAddressCount(expectedCount);

            currentCount = await this.getAddressCount();
        }

        // Create missing — wait for each to render before creating the next so
        // the next createTestAddress() doesn't race with this one's revalidation.
        const addressesToCreate = exactCount - currentCount;
        for (let i = 0; i < addressesToCreate; i++) {
            this.createTestAddress(i);
            await this.waitForAddressCount(currentCount + i + 1);
        }

        // Even when count was already exactCount (no deletes/creates), inner
        // names may still be rendering on a fresh navigate. Wait for the
        // post-condition so callers can safely read positional data.
        await this.waitForAddressCount(exactCount);
    }
}

// Export as singleton
export = new AccountAddressesPage();
