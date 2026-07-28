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
 * Centralized class names for account/payment destructive actions (remove payment method,
 * remove authorized person, etc.). Uses --account-action-destructive theme token so global
 * --destructive is unchanged. Use these instead of duplicating long className strings.
 */

/** Red primary button (e.g. "Remove" in Remove Payment Method dialog, delete confirm in Authorized Pickup). */
export const accountDestructiveButtonClasses =
    'bg-account-action-destructive text-account-action-destructive-foreground hover:bg-account-action-destructive/90 focus-visible:ring-account-action-destructive/20';

/** Error alert (e.g. form validation in Add Payment Method dialog). */
export const accountDestructiveAlertClasses =
    'text-account-action-destructive [&_[data-slot=alert-description]]:text-account-action-destructive/90';

/** Icon or link that is muted by default and red on hover (e.g. trash in Authorized Pickup list). */
export const accountDestructiveIconHoverClasses =
    'cursor-pointer text-muted-foreground hover:bg-account-action-destructive/10 hover:text-account-action-destructive';

/**
 * Primary filled CTA in account surfaces (e.g. "Buy Again" on order details, "Rate & review" on the
 * account overview). Uses the --account-action-primary theme token so each vertical decides the fill
 * (neutral foreground by default; brand blue in Foundations) without hardcoding a color at the call site.
 */
export const accountPrimaryButtonClasses =
    'bg-account-action-primary text-account-action-primary-foreground hover:bg-account-action-primary/90';
