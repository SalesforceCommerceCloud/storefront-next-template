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
import type { ActionFunctionArgs } from 'react-router';
import { type ShopperBasketsV2, type ShopperCustomers, type ShopperOrders } from '@/scapi';
import { customAlphabet, nanoid } from 'nanoid';
import { createApiClients } from '@/lib/api-clients.server';
import { getAuth, clearInvalidSessionAndRestoreGuest } from '@/middlewares/auth.server';
import { loginRegisteredUser } from '@/lib/api/auth/standard-login.server';
import { extractResponseError } from '@/lib/utils';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { orderAddressToCustomerAddress } from '@/lib/address/address-utils';
import { getLogger } from '@/lib/logger.server';

/**
 * Customer lookup result
 */
export interface CustomerLookupResult {
    isRegistered: boolean;
    customer?: ShopperCustomers.schemas['Customer'];
    requiresLogin?: boolean;
    error?: string;
}

/**
 * Validates that an address has all required fields for customer address creation.
 *
 * @param address - The address to validate
 * @throws Error if any required field is missing
 */
function validateAddress(
    address: ShopperBasketsV2.schemas['OrderAddress'] | ShopperCustomers.schemas['CustomerAddress']
): void {
    const { t } = getTranslation();

    if (!address.countryCode) {
        throw new Error(t('errors:customer.countryCodeRequired'));
    }
    if (!address.address1) {
        throw new Error(t('errors:customer.addressLine1Required'));
    }
    if (!address.city) {
        throw new Error(t('errors:customer.cityRequired'));
    }
    if (!address.firstName) {
        throw new Error(t('errors:customer.firstNameRequired'));
    }
    if (!address.lastName) {
        throw new Error(t('errors:customer.lastNameRequired'));
    }
    if (!address.postalCode) {
        throw new Error(t('errors:customer.postalCodeRequired'));
    }
}

/**
 * Look up a customer by email address to determine if they are a guest or registered user.
 *
 * This function attempts to find a customer account associated with the provided email.
 *
 * @param context - React Router context
 * @param email - Email address to lookup
 * @returns CustomerLookupResult indicating if the customer is registered
 */
export async function lookupCustomerByEmail(
    context: ActionFunctionArgs['context'],
    email: string
): Promise<CustomerLookupResult> {
    const { t } = getTranslation();

    try {
        // Validate email format
        if (!email || !email.includes('@')) {
            return {
                isRegistered: false,
                error: t('errors:customer.invalidEmailFormat'),
            };
        }

        const session = getAuth(context);

        // If this is already a registered user session, check if email matches
        if (session.userType === 'registered' && session.customerId) {
            try {
                const clients = createApiClients(context);
                const { data: customer } = await clients.shopperCustomers.getCustomer({
                    params: {
                        path: {
                            customerId: session.customerId,
                        },
                    },
                });

                // Check if the provided email matches the current user's email
                if (customer.login?.toLowerCase() === email.toLowerCase()) {
                    return {
                        isRegistered: true,
                        customer,
                        requiresLogin: false,
                    };
                }
            } catch {
                // Customer lookup failed - continue as guest
                // Don't rethrow the error - just continue with guest flow below
                // This handles cases where the session has an invalid customerId
            }
        }

        // For now, we'll return a result that indicates the customer might be registered
        // and should be prompted to login, but allow them to continue as guest
        return {
            isRegistered: false, // We can't definitively determine this
            requiresLogin: false, // Allow guest checkout
            error: undefined,
        };
    } catch {
        return {
            isRegistered: false,
            error: t('errors:customer.customerLookupUnavailable'),
        };
    }
}

/**
 * Check if the current session belongs to a registered customer (client-side)
 *
 * @param context - React Router context
 * @returns boolean indicating if user is registered and logged in
 */
export function isRegisteredCustomer(context: ActionFunctionArgs['context']): boolean {
    const session = getAuth(context);
    return !!(
        session.userType === 'registered' &&
        session.customerId &&
        session.accessToken &&
        session.accessTokenExpiry &&
        session.accessTokenExpiry > Date.now()
    );
}

/**
 * Get current customer information if logged in as registered user
 *
 * @param context - React Router context
 * @returns Customer information or null if not logged in
 */
export async function getCurrentCustomer(
    context: ActionFunctionArgs['context']
): Promise<ShopperCustomers.schemas['Customer'] | null> {
    try {
        if (!isRegisteredCustomer(context)) {
            return null;
        }

        const session = getAuth(context);

        if (!session.customerId) {
            return null;
        }

        const clients = createApiClients(context);

        const { data: customer } = await clients.shopperCustomers.getCustomer({
            params: {
                path: {
                    customerId: session.customerId,
                },
            },
        });

        return customer;
    } catch (error) {
        const { status_code } = await extractResponseError(error);
        // Handle specific error cases
        if (status_code === '404') {
            // Customer not found (404) - invalid customerId in auth cookies
            // This can happen when:
            // - Customer account was deleted from Commerce Cloud
            // - Using cookies from a different environment (e.g., staging → production)
            // - Token/customer data sync issues
            //
            // Clear the invalid session and get fresh guest tokens
            // The auth middleware will delete cookies via Set-Cookie headers
            clearInvalidSessionAndRestoreGuest(context).catch(() => {
                // Ignore errors - we'll return null and let the caller handle it
            });
        }
        return null;
    }
}

/**
 * Customer lookup that provides UX recommendations for the checkout flow
 * This is the main customer lookup function used in checkout
 *
 * @param context - React Router context
 * @param email - Email address to analyze
 * @returns Customer lookup result with UX recommendations
 */
export async function customerLookup(
    context: ActionFunctionArgs['context'],
    email: string
): Promise<
    CustomerLookupResult & {
        recommendation: 'guest' | 'login_suggested' | 'current_user';
        message?: string;
    }
> {
    const { t } = getTranslation();
    const basicResult = await lookupCustomerByEmail(context, email);

    // If current user is logged in and email matches
    if (basicResult.customer && !basicResult.requiresLogin) {
        return {
            ...basicResult,
            recommendation: 'current_user' as const,
            message: t('customer:messages.currentUserRecommendation'),
        };
    }

    // For unknown emails, suggest they can continue as guest or login if they have an account
    return {
        ...basicResult,
        recommendation: 'guest' as const,
        message: t('customer:messages.guestRecommendation'),
    };
}

/**
 * Generate a random password for guest user registration
 * Based on PWA Kit's proven password generation that meets Commerce Cloud requirements:
 * - At least 8 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 number
 * - At least 1 special character
 *
 * @returns A random password string that meets all Commerce Cloud requirements
 */
export function generateRandomPassword(): string {
    return (
        nanoid(8) + // 8 random alphanumeric chars (includes upper/lower)
        customAlphabet('1234567890')(1) + // 1 guaranteed number
        customAlphabet('!@#$%^&*(),.?":{}|<>')(1) + // 1 guaranteed special character
        nanoid(2) // 2 additional random chars for extra security
    );
}

/**
 * Extracts a reasonable first and last name from an email address
 * Handles common patterns like john.doe@example.com, jane_smith@company.org
 *
 * @param email - The email address to extract names from
 * @returns Object with firstName and lastName
 */
export function extractNameFromEmail(email: string): { firstName: string; lastName: string } {
    const { t } = getTranslation();

    // Input validation and sanitization
    if (!email || typeof email !== 'string') {
        return {
            firstName: t('customer:defaults.guestFirstName'),
            lastName: t('customer:defaults.guestLastName'),
        };
    }

    // Extract and clean the username part before @
    const username = email.split('@')[0]?.toLowerCase().trim();
    if (!username) {
        return {
            firstName: t('customer:defaults.guestFirstName'),
            lastName: t('customer:defaults.guestLastName'),
        };
    }

    // Remove common number suffixes and normalize
    const cleanUsername = username.replace(/\d+$/, '');

    // Define separators in order of preference (dots are more common than underscores)
    const separators = ['.', '_', '-'];

    for (const separator of separators) {
        if (cleanUsername.includes(separator)) {
            const parts = cleanUsername.split(separator).filter((part) => part.length > 0); // Remove empty parts

            if (parts.length >= 2) {
                return {
                    firstName: capitalizeFirstLetter(parts[0]),
                    lastName: capitalizeFirstLetter(parts[1]),
                };
            }
        }
    }

    // Handle camelCase patterns (e.g., johnDoe -> John Doe)
    // Note: This works on the original username before lowercasing
    const originalUsername = email.split('@')[0]?.trim();
    if (originalUsername) {
        const camelCaseMatch = originalUsername.match(/^([a-z]+)([A-Z][a-z]+)$/);
        if (camelCaseMatch) {
            return {
                firstName: capitalizeFirstLetter(camelCaseMatch[1]),
                lastName: capitalizeFirstLetter(camelCaseMatch[2]),
            };
        }
    }

    // Fallback: use cleaned username as first name
    return {
        firstName: capitalizeFirstLetter(cleanUsername) || t('customer:defaults.guestFirstName'),
        lastName: t('customer:defaults.guestLastName'),
    };
}

/**
 * Capitalizes the first letter of a string while keeping the rest lowercase
 *
 * @param str - String to capitalize
 * @returns Capitalized string
 */
function capitalizeFirstLetter(str: string): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Login a customer after registration (auto-login)
 *
 * @param context - React Router context
 * @param email - The email address for login
 * @param password - The password for login
 * @returns Promise with login result
 */
async function loginCustomerAfterRegistration(
    context: ActionFunctionArgs['context'],
    email: string,
    password: string
): Promise<{
    success: boolean;
    error?: string;
}> {
    const loginResult = await loginRegisteredUser(context, { email, password });
    return loginResult;
}

/**
 * Register a guest user account after checkout completion
 *
 * @param context - React Router context
 * @param email - The email address for the new account
 * @param orderInfo - Optional order information to associate with the account
 * @returns Promise with registration result
 */
export async function registerGuestUser(
    context: ActionFunctionArgs['context'],
    email: string,
    orderInfo?: {
        orderNo: string;
        customerInfo?: ShopperBasketsV2.schemas['CustomerInfo'];
        shippingAddress?: ShopperBasketsV2.schemas['OrderAddress'];
    }
): Promise<{
    success: boolean;
    customerId?: string;
    password?: string;
    error?: string;
    autoLoggedIn?: boolean;
}> {
    const { t } = getTranslation();
    try {
        // Validate email format
        if (!email || !email.includes('@')) {
            return {
                success: false,
                error: t('errors:customer.invalidEmailFormat'),
            };
        }

        // Extract name with priority: shipping address > customer info > email extraction
        const nameFromEmail = extractNameFromEmail(email);
        const toStr = (val: unknown): string | undefined => (typeof val === 'string' && val ? val : undefined);
        const firstName =
            toStr(orderInfo?.shippingAddress?.firstName) ??
            toStr(orderInfo?.customerInfo?.firstName) ??
            nameFromEmail.firstName;
        const lastName =
            toStr(orderInfo?.shippingAddress?.lastName) ??
            toStr(orderInfo?.customerInfo?.lastName) ??
            nameFromEmail.lastName;

        // Generate a random password for the account
        const password = generateRandomPassword();

        // Prepare registration data
        const registrationData: ShopperCustomers.schemas['CustomerRegistration'] = {
            customer: {
                login: email,
                email,
                firstName,
                lastName,
            },
            password,
        };

        // Register the customer directly using Commerce Cloud API
        const clients = createApiClients(context);

        // Register the customer
        await clients.shopperCustomers.registerCustomer({
            params: {},
            body: registrationData,
        });

        // After registration, automatically log the user in
        // Add a small delay to ensure registration is fully processed
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const loginResult = await loginCustomerAfterRegistration(context, email, password);

        if (loginResult.success) {
            // Get the updated session after login to retrieve customerId
            const updatedSession = getAuth(context);

            return {
                success: true,
                customerId: updatedSession.customerId,
                password,
                autoLoggedIn: true,
            };
        } else {
            // Registration succeeded but auto-login failed
            // Still return success since the account was created
            return {
                success: true,
                password,
                autoLoggedIn: false,
                error: t('errors:customer.autoLoginAfterRegistrationFailed'),
            };
        }
    } catch {
        // Guest user registration failed
        return {
            success: false,
            error: t('errors:customer.registrationFailed'),
        };
    }
}

/**
 * Save a customer address to their profile
 *
 * @param context - React Router context
 * @param customerId - The customer ID to save the address for
 * @param address - The customer address to save
 * @returns Promise<boolean> indicating success
 */
export async function saveCustomerAddress(
    context: ActionFunctionArgs['context'],
    customerId: string,
    address: ShopperCustomers.schemas['CustomerAddress']
): Promise<boolean> {
    try {
        const clients = createApiClients(context);

        // Validate required address fields
        validateAddress(address);

        await clients.shopperCustomers.createCustomerAddress({
            params: {
                path: {
                    customerId,
                },
            },
            body: address,
        });

        return true;
    } catch {
        // Failed to save address
        return false;
    }
}

/**
 * Save customer's shipping address to their profile
 *
 * @param context - React Router context
 * @param customerId - The customer ID to save the address for
 * @param address - The shipping address to save
 * @returns Promise<boolean> indicating success
 */
export async function saveShippingAddressToCustomer(
    context: ActionFunctionArgs['context'],
    customerId: string,
    address: ShopperBasketsV2.schemas['OrderAddress'],
    preferred: boolean = false
): Promise<boolean> {
    // Convert OrderAddress to CustomerAddress and delegate to saveCustomerAddress
    const customerAddress = orderAddressToCustomerAddress(address, preferred);
    return saveCustomerAddress(context, customerId, customerAddress);
}

/**
 * Save customer's billing address to their profile
 *
 * @param context - React Router context
 * @param customerId - The customer ID to save the address for
 * @param address - The billing address to save
 * @returns Promise<boolean> indicating success
 */
export async function saveBillingAddressToCustomer(
    context: ActionFunctionArgs['context'],
    customerId: string,
    address: ShopperBasketsV2.schemas['OrderAddress']
): Promise<boolean> {
    try {
        const clients = createApiClients(context);

        // Validate required address fields
        validateAddress(address);

        // Create the address for the customer with validated fields
        const customerAddress = {
            addressId: `billing_${Date.now()}`, // Generate unique address ID
            address1: address.address1 as string,
            address2: address.address2,
            city: address.city as string,
            countryCode: address.countryCode as string,
            firstName: address.firstName as string,
            lastName: address.lastName as string,
            phone: address.phone,
            postalCode: address.postalCode as string,
            stateCode: address.stateCode,
            preferred: false, // Will be set as preferred billing in the profile logic
        };

        await clients.shopperCustomers.createCustomerAddress({
            params: {
                path: {
                    customerId,
                },
            },
            body: customerAddress,
        });

        return true;
    } catch {
        // Failed to save billing address
        return false;
    }
}

/**
 * Update customer profile with phone number and other contact information
 *
 * @param context - React Router context
 * @param customerId - The customer ID to update
 * @param contactInfo - Contact information to update
 * @returns Promise<boolean> indicating success
 */
export async function updateCustomerContactInfo(
    context: ActionFunctionArgs['context'],
    customerId: string,
    contactInfo: {
        phone?: string;
        email?: string;
        firstName?: string;
        lastName?: string;
    }
): Promise<boolean> {
    try {
        const clients = createApiClients(context);

        // Update customer profile with contact information
        const customerUpdate = {
            ...(contactInfo.phone && { phoneHome: contactInfo.phone }),
            ...(contactInfo.email && { email: contactInfo.email }),
            ...(contactInfo.firstName && { firstName: contactInfo.firstName }),
            ...(contactInfo.lastName && { lastName: contactInfo.lastName }),
        };

        await clients.shopperCustomers.updateCustomer({
            params: {
                path: {
                    customerId,
                },
            },
            body: customerUpdate,
        });

        return true;
    } catch {
        // Failed to update customer contact info
        return false;
    }
}

/**
 * Get customer's saved addresses from their profile
 * Note: Commerce Cloud stores addresses in the customer profile, not a separate endpoint
 *
 * @param context - React Router context
 * @param customerId - The customer ID to get addresses for
 * @returns Promise with customer addresses
 */
export async function getCustomerAddresses(
    context: ActionFunctionArgs['context'],
    customerId: string
): Promise<ShopperCustomers.schemas['CustomerAddress'][]> {
    try {
        const clients = createApiClients(context);

        // Get customer profile which includes addresses
        const { data: customer } = await clients.shopperCustomers.getCustomer({
            params: {
                path: {
                    customerId,
                },
            },
        });

        // Extract addresses from customer profile
        // In Commerce Cloud, addresses are stored as part of the customer object
        return customer.addresses || [];
    } catch {
        // Failed to get customer addresses
        return [];
    }
}

/**
 * Get customer's saved payment instruments from their profile
 * Note: Commerce Cloud stores payment instruments in the customer profile
 *
 * @param context - React Router context
 * @param customerId - The customer ID to get payment methods for
 * @returns Promise with customer payment instruments
 */
export async function getCustomerPaymentInstruments(
    context: ActionFunctionArgs['context'],
    customerId: string
): Promise<ShopperCustomers.schemas['CustomerPaymentInstrument'][]> {
    try {
        const clients = createApiClients(context);

        // Get customer profile which includes payment instruments
        const { data: customer } = await clients.shopperCustomers.getCustomer({
            params: {
                path: {
                    customerId,
                },
            },
        });

        // Extract payment instruments from customer profile
        // In Commerce Cloud, payment instruments are stored as part of the customer object
        return customer.paymentInstruments || [];
    } catch {
        // Failed to get customer payment instruments
        return [];
    }
}

/**
 * Get complete customer profile including addresses and payment methods
 * Simplified approach - get customer with all data in one call
 *
 * @param context - React Router context
 * @param customerId - The customer ID to get profile for
 * @returns Promise with complete customer profile data
 */
export async function getCustomerProfileForCheckout(
    context: ActionFunctionArgs['context'],
    customerId: string
): Promise<{
    customer?: ShopperCustomers.schemas['Customer'];
    addresses: ShopperCustomers.schemas['CustomerAddress'][];
    paymentInstruments: ShopperCustomers.schemas['CustomerPaymentInstrument'][];
    preferredShippingAddress?: ShopperCustomers.schemas['CustomerAddress'];
    preferredBillingAddress?: ShopperCustomers.schemas['CustomerAddress'];
} | null> {
    try {
        const clients = createApiClients(context);

        // Get customer profile with addresses and payment instruments explicitly expanded
        const { data: customer } = await clients.shopperCustomers.getCustomer({
            params: {
                path: {
                    customerId,
                },
                query: {
                    expand: ['addresses', 'paymentinstruments'],
                },
            },
        });

        // Extract addresses and payment instruments from customer profile
        const addresses = customer.addresses || [];
        const paymentInstruments = customer.paymentInstruments || [];

        // Find preferred addresses with priority logic
        const billingAddresses = addresses.filter((addr) => addr.addressId?.includes('billing'));
        const shippingAddresses = addresses.filter((addr) => addr.addressId?.includes('shipping'));

        // For billing address preference: billing addresses first, then any preferred, then first available
        const preferredBillingAddress = billingAddresses[0] || addresses.find((addr) => addr.preferred) || addresses[0];

        // For shipping address preference: shipping addresses first, then billing as fallback, then any
        const preferredShippingAddress =
            shippingAddresses.find((addr) => addr.preferred) ||
            shippingAddresses[0] ||
            billingAddresses[0] ||
            addresses.find((addr) => addr.preferred) ||
            addresses[0];

        return {
            customer,
            addresses,
            paymentInstruments,
            preferredShippingAddress,
            preferredBillingAddress,
        };
    } catch (error: unknown) {
        // Failed to get customer profile for checkout
        const { status_code } = await extractResponseError(error);
        // Handle specific error cases
        if (status_code === '404') {
            // Customer not found (404) - invalid customerId in auth cookies
            // This can happen when:
            // - Customer account was deleted from Commerce Cloud
            // - Using cookies from a different environment (e.g., staging → production)
            // - Token/customer data sync issues
            //
            // Clear the invalid session and get fresh guest tokens
            // The auth middleware will delete cookies via Set-Cookie headers
            clearInvalidSessionAndRestoreGuest(context).catch(() => {
                // Ignore errors - we'll return null and let the caller handle it
            });

            // Return null to indicate no customer profile available.
            // Calling code handles this by:
            // - checkout-loaders.ts: Falls through to guest user flow
            // - action.place-order.ts: Skips saved payment methods (treats as guest)
            return null;
        }

        // For other errors, throw to be handled by calling code
        throw error;
    }
}

/**
 * Derive last 4 digits from an order/basket payment card (read-only fields).
 * Used when saving a payment method from place order where we don't have the full number.
 */
function getLastFourFromPaymentCard(card: { numberLastDigits?: string; maskedNumber?: string }): string | undefined {
    if (card.numberLastDigits && /^\d{4}$/.test(card.numberLastDigits)) {
        return card.numberLastDigits;
    }
    if (card.maskedNumber) {
        const digits = card.maskedNumber.replace(/\D/g, '');
        const last4 = digits.slice(-4);
        if (last4.length === 4) {
            return last4;
        }
    }
    return undefined;
}

/**
 * Input for saving a payment method: either full request (add form) or order instrument
 * (has numberLastDigits/maskedNumber, no number). Used so we can pass order.paymentInstruments[0].
 */
export type PaymentInstrumentForSave = {
    paymentMethodId?: string;
    paymentCard?: {
        cardType?: string;
        number?: string;
        expirationMonth?: number;
        expirationYear?: number;
        holder?: string;
        numberLastDigits?: string;
        maskedNumber?: string;
    };
    default?: boolean;
};

/**
 * Save a payment method to a customer's profile.
 * When saving from an order (no full card number), last 4 digits are derived from
 * numberLastDigits or maskedNumber and sent as a masked number so the backend can store them.
 *
 * @param context - React Router context
 * @param customerId - The customer ID to save the payment method for
 * @param paymentInstrument - The payment instrument to save (request shape or order instrument with read-only fields)
 * @returns Promise<boolean> indicating success
 */
export async function savePaymentMethodToCustomer(
    context: ActionFunctionArgs['context'],
    customerId: string,
    paymentInstrument: PaymentInstrumentForSave
): Promise<boolean> {
    const logger = getLogger(context);
    try {
        const clients = createApiClients(context);

        const card = paymentInstrument.paymentCard;
        // When saving from order we don't have paymentCard.number; derive last 4 from order so backend can persist them
        const cardWithReadOnly = card as
            | (typeof card & { numberLastDigits?: string; maskedNumber?: string })
            | undefined;
        const derivedLast4 = cardWithReadOnly && getLastFourFromPaymentCard(cardWithReadOnly);
        const numberForRequest = card?.number ?? (derivedLast4 ? `************${derivedLast4}` : null);
        if (!numberForRequest) {
            logger.error('Cannot save payment method: no card number available');
            return false;
        }

        const customerPaymentInstrument = {
            paymentMethodId: paymentInstrument.paymentMethodId,
            paymentCard: card
                ? {
                      cardType: card.cardType,
                      number: numberForRequest,
                      expirationMonth: card.expirationMonth,
                      expirationYear: card.expirationYear,
                      holder: card.holder,
                  }
                : undefined,
            default: paymentInstrument.default,
        };

        await clients.shopperCustomers.createCustomerPaymentInstrument({
            params: {
                path: {
                    customerId,
                },
            },
            body: customerPaymentInstrument as ShopperCustomers.schemas['CustomerPaymentInstrumentRequest'],
        });

        return true;
    } catch {
        // Failed to save payment method to customer profile
        return false;
    }
}

/**
 * Save a payment method to a customer's profile via the order payment instrument endpoint.
 * Uses shopperOrders.createPaymentInstrumentForOrder with createCustomerPaymentInstrument: true,
 * which triggers the platform's internal copy that preserves creditCardToken — unlike the direct
 * shopperCustomers.createCustomerPaymentInstrument endpoint which silently drops the token.
 */
export async function savePaymentMethodToCustomerViaOrder(
    context: ActionFunctionArgs['context'],
    orderNo: string,
    paymentInstrument: PaymentInstrumentForSave
): Promise<boolean> {
    const logger = getLogger(context);
    try {
        const clients = createApiClients(context);
        const card = paymentInstrument.paymentCard;

        await clients.shopperOrders.createPaymentInstrumentForOrder({
            params: {
                path: { orderNo },
            },
            body: {
                paymentMethodId: paymentInstrument.paymentMethodId,
                amount: 0,
                paymentCard: card
                    ? {
                          cardType: card.cardType,
                          holder: card.holder,
                          expirationMonth: card.expirationMonth,
                          expirationYear: card.expirationYear,
                          maskedNumber: card.maskedNumber,
                          creditCardToken: (card as { creditCardToken?: string }).creditCardToken,
                      }
                    : undefined,
                createCustomerPaymentInstrument: true,
            } as ShopperOrders.schemas['OrderPaymentInstrumentRequest'],
        });

        return true;
    } catch (error) {
        logger.error('Failed to save payment method via order', { error, orderNo });
        return false;
    }
}

/**
 * Delete a payment method from a customer's profile
 *
 * @param context - React Router context
 * @param customerId - The customer ID
 * @param paymentInstrumentId - The payment instrument ID to delete
 * @returns Promise<boolean> indicating success
 */
export async function deleteCustomerPaymentInstrument(
    context: ActionFunctionArgs['context'],
    customerId: string,
    paymentInstrumentId: string
): Promise<boolean> {
    try {
        const clients = createApiClients(context);

        await clients.shopperCustomers.deleteCustomerPaymentInstrument({
            params: {
                path: {
                    customerId,
                    paymentInstrumentId,
                },
            },
        });

        return true;
    } catch {
        // Failed to delete payment method from customer profile
        return false;
    }
}

/**
 * Set a payment method as the default for a customer
 * Note: Payment card details cannot be changed once saved. To update card details,
 * you must delete the payment method and create a new one.
 *
 * @param context - React Router context
 * @param customerId - The customer ID
 * @param paymentInstrumentId - The payment instrument ID to set as default
 * @returns Promise<boolean> indicating success
 */
export async function setDefaultPaymentInstrument(
    context: ActionFunctionArgs['context'],
    customerId: string,
    paymentInstrumentId: string
): Promise<boolean> {
    try {
        const clients = createApiClients(context);

        await clients.shopperCustomers.updateCustomerPaymentInstrument({
            params: {
                path: {
                    customerId,
                    paymentInstrumentId,
                },
            },
            body: {
                default: true,
            },
        });

        return true;
    } catch {
        // Failed to set payment method as default
        return false;
    }
}

export async function getCustomer(
    context: ActionFunctionArgs['context'],
    customerId: string
): Promise<ShopperCustomers.schemas['Customer']> {
    const clients = createApiClients(context);
    const { data: customer } = await clients.shopperCustomers.getCustomer({
        params: {
            path: {
                customerId,
            },
        },
    });
    return customer;
}

/**
 * Update customer custom attributes (c_* fields).
 *
 * @param context - React Router context
 * @param customerId - The customer ID to update
 * @param attrs - Custom attribute key-value pairs to set
 * @returns Promise<boolean> indicating success
 */
export async function updateCustomerCustomAttributes(
    context: ActionFunctionArgs['context'],
    customerId: string,
    attrs: Record<string, unknown>
): Promise<boolean> {
    try {
        const clients = createApiClients(context);

        // PATCH /customers/{customerId} with c_* attributes
        await clients.shopperCustomers.updateCustomer({
            params: {
                path: {
                    customerId,
                },
            },
            body: attrs as ShopperCustomers.schemas['Customer'],
        });

        return true;
    } catch {
        // Failed to update custom attributes
        return false;
    }
}
