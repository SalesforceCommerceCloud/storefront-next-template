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
 * Validates the passkey registration success toast appears immediately after
 * a WebAuthn ceremony completes, and that no passkey toast reappears after a
 * subsequent logout. Uses a CDP virtual authenticator for the real WebAuthn
 * ceremony and network stubs for the OTP-gated action routes, since real OTP
 * delivery cannot be verified in E2E tests (see `passkey-registration-stub.ts`).
 */

Feature('Passkey Registration').tag('@core').tag('@passkeys');

const { storefrontPage, passkeyRegistrationPage, apiSignupFlow, passkeyRegistrationFlow } = inject();
import { expect } from 'chai';

After(async () => {
    await passkeyRegistrationFlow.teardown();
});

Scenario('Success toast appears immediately after passkey registration completes', async () => {
    const { signupData } = await apiSignupFlow.execute();
    await passkeyRegistrationFlow.setup(signupData.email);

    storefrontPage.navigate();
    await passkeyRegistrationFlow.waitForUpsellToast();

    const upsellAppeared = await passkeyRegistrationPage.isUpsellToastVisible();
    expect(upsellAppeared, 'Passkey upsell toast should appear for a registered shopper with no passkey').to.be.true;

    await passkeyRegistrationFlow.executeFromUpsellToast();
    await passkeyRegistrationFlow.waitForSuccessToast();

    const successToastVisible = await passkeyRegistrationPage.isSuccessToastVisible();
    expect(successToastVisible, 'Success toast should be visible immediately after registration completes').to.be.true;
})
    .tag('@toast')
    .tag('@smoke');

Scenario('No passkey toast reappears after logging out following registration', async () => {
    const { signupData } = await apiSignupFlow.execute();
    await passkeyRegistrationFlow.setup(signupData.email);

    storefrontPage.navigate();
    await passkeyRegistrationFlow.executeFromUpsellToast();

    await storefrontPage.logout();

    const upsellVisibleAfterLogout = await passkeyRegistrationPage.isUpsellToastVisible();
    expect(upsellVisibleAfterLogout, 'Passkey upsell toast should not reappear for a guest after logout').to.be.false;
})
    .tag('@toast')
    .tag('@regression');

export {};
