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
export { PaymentMethods } from './payment-methods';

// Dialogs
export { AddPaymentMethodDialog } from './add-payment-method-dialog';
export { RemovePaymentMethodDialog } from './remove-payment-method-dialog';

// Dialog context providers for CAP replacements of add/remove form bodies.
// Hooks: import from `./account-payment-dialog-context` (barrel cannot re-export hooks).
export {
    AddPaymentMethodDialogProvider,
    RemovePaymentMethodDialogProvider,
} from './account-payment-dialog-context';
export type {
    AddPaymentMethodDialogContextValue,
    RemovePaymentMethodDialogContextValue,
} from './account-payment-dialog-context';

// Card components
export { PaymentMethodCard } from './payment-method-card';
export type { PaymentMethod } from './payment-method-card';

// Skeleton
export { AccountPaymentMethodsSkeleton } from './account-payment-methods-skeleton';
