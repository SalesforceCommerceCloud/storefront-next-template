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

// Main component
export { PasskeysManagement } from './passkeys-management';

// Dialogs
export { DeletePasskeyDialog } from './delete-passkey-dialog';

// Card component
export { PasskeyCard } from './passkey-card';
export type { PasskeyCredential } from './passkey-card';

// Inline list load-error (Await errorElement)
export { PasskeysLoadError } from './passkeys-load-error';

// Registration modal (reused from the registration ticket)
export { PasskeyRegistrationModal } from './passkey-registration-modal';
