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
 * Flow Registry
 * Central registration of all reusable flows for CodeceptJS
 *
 * To add a new flow:
 * 1. Create the flow file in src/flows/
 * 2. Add an entry here with the key and path
 * 3. The flow will automatically be available via inject()
 */
export const flows = {
    addToCartFlow: './src/flows/add-to-cart.flow.ts',
    apiCartSetupFlow: './src/flows/api-cart-setup.flow.ts',
    addToWishlistFlow: './src/flows/add-to-wishlist.flow.ts',
    signupFlow: './src/flows/signup.flow.ts',
    apiSignupFlow: './src/flows/api-signup.flow.ts',
    loginFlow: './src/flows/login.flow.ts',
    apiLoginFlow: './src/flows/api-login.flow.ts',
    registeredShopperSetupFlow: './src/flows/registered-shopper-setup.flow.ts',
    beaconCaptureFlow: './src/flows/beacon-capture.flow.ts',
    passkeyRegistrationFlow: './src/flows/passkey-registration.flow.ts',
    passkeyLoginFlow: './src/flows/passkey-login.flow.ts',
};
