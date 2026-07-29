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

const { I, signupFlow, accountAddressesPage, accountDetailsPage, accountPaymentMethodsPage } = inject();
import type { SignupData } from '../types/auth.types';
import { TEST_PAYMENT } from '../test-data/checkout.data';
import { credentialStore } from '../utils/credential-store';
import { getScapiConfig, createRegisteredShopperViaApi } from '../utils/scapi-helper';
import { injectAndActivateRegisteredSession } from '../utils/cookie-utils';

interface RegisteredShopperSetupResult {
    signupData: SignupData;
    addressData: {
        firstName: string;
        lastName: string;
        phone: string;
        address1: string;
        city: string;
        stateCode: string;
        postalCode: string;
    };
}

/**
 * Registered Shopper Setup Flow
 *
 * Creates a new registered shopper with complete profile for checkout:
 * 1. Register via signup
 * 2. Add shipping address on /account/addresses
 * 3. Update profile with phone on /account
 * 4. Add payment method on /account/payment-methods
 *
 * When SCAPI config is available, all four steps are performed via direct API
 * calls and the registered session is injected into the browser via cookies.
 * This avoids four page navigations and multiple form fills, significantly
 * reducing setup time. Falls back to the UI-based flow when SCAPI config is
 * missing or the API path fails.
 */
class RegisteredShopperSetupFlow {
    private getBillingAddressOptionText(addressData: {
        firstName: string;
        lastName: string;
        address1: string;
        city: string;
    }): string {
        return `${addressData.firstName} ${addressData.lastName} - ${addressData.address1}, ${addressData.city}...`;
    }

    /**
     * Execute the complete registered shopper setup flow.
     * Tries API-based setup first, falls back to UI when unavailable.
     */
    async execute(): Promise<RegisteredShopperSetupResult> {
        const config = getScapiConfig();

        if (config) {
            try {
                return await this.executeViaApi(config);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                // oxlint-disable-next-line no-console
                console.warn(`API registered shopper setup failed (${message}), falling back to UI flow`);
            }
        }

        return this.executeViaUi();
    }

    private async executeViaApi(
        config: NonNullable<ReturnType<typeof getScapiConfig>>
    ): Promise<RegisteredShopperSetupResult> {
        const result = await createRegisteredShopperViaApi(config);

        await injectAndActivateRegisteredSession(config.siteId, result.tokens);

        credentialStore.store({
            email: result.signupData.email,
            password: result.signupData.password,
            firstName: result.signupData.firstName,
            lastName: result.signupData.lastName,
            createdAt: Date.now(),
        });

        return {
            signupData: {
                ...result.signupData,
                confirmPassword: result.signupData.password,
            },
            addressData: {
                firstName: result.addressData.firstName,
                lastName: result.addressData.lastName,
                phone: result.addressData.phone,
                address1: result.addressData.address1,
                city: result.addressData.city,
                stateCode: result.addressData.stateCode,
                postalCode: result.addressData.postalCode,
            },
        };
    }

    private async executeViaUi(): Promise<RegisteredShopperSetupResult> {
        try {
            const { signupData } = await signupFlow.execute();
            accountAddressesPage.navigate();
            accountAddressesPage.validatePageLoaded();

            const addressData = accountAddressesPage.createTestAddress();

            accountDetailsPage.navigate();
            accountDetailsPage.validatePageLoaded();
            accountDetailsPage.clickEditProfile();
            accountDetailsPage.fillProfileForm({ phone: addressData.phone });
            accountDetailsPage.clickSaveProfile();
            accountDetailsPage.validateSuccessToast();

            accountPaymentMethodsPage.navigate();
            accountPaymentMethodsPage.validatePageLoaded();
            const billingAddressOptionText = this.getBillingAddressOptionText(addressData);
            accountPaymentMethodsPage.addPaymentMethod(TEST_PAYMENT, billingAddressOptionText);
            accountPaymentMethodsPage.validateSuccessToast();

            return {
                signupData,
                addressData: {
                    firstName: addressData.firstName,
                    lastName: addressData.lastName,
                    phone: addressData.phone,
                    address1: addressData.address1,
                    city: addressData.city,
                    stateCode: addressData.stateCode,
                    postalCode: addressData.postalCode,
                },
            };
        } catch (error) {
            I.saveScreenshot(`registered-shopper-setup-error-${Date.now()}.png`);
            throw error;
        }
    }
}

export = new RegisteredShopperSetupFlow();
