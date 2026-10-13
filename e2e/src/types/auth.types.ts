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
 * Custom E2E Test Types - Authentication
 *
 * NOTE: These are NOT SCAPI or backend types.
 * These are custom types used exclusively by E2E tests, page objects, and flows
 * for capturing and validating authentication and user account data during test execution.
 */

/**
 * Shopper Signup Data Interface
 * Used for signup flow test data generation and validation
 */
export interface SignupData {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    confirmPassword: string;
}

/**
 * Shopper Login Data Interface
 * Used for login flow test data
 */
export interface LoginData {
    email: string;
    password: string;
}

/**
 * Options for the signup flow execution
 */
export interface SignupFlowOptions {
    /** Custom signup data — merged over randomly generated data */
    customData?: Partial<SignupData>;
    /** Whether to accept the tracking consent banner (default: true) */
    acceptTracking?: boolean;
    /** Add an item to the cart and log out after signup (default: false) */
    createBasket?: boolean;
    /** Category URL used when createBasket is true (default: 'c/mens-clothing-jackets') */
    categoryUrl?: string;
}

/**
 * Options for the login flow execution
 */
export interface LoginFlowOptions {
    /** Custom login credentials — uses stored credentials if not provided */
    customData?: LoginData;
    /** Whether to accept the tracking consent banner (default: true) */
    acceptTracking?: boolean;
}

/**
 * Stored Credentials Interface
 * Credentials stored in session for reuse across tests
 */
export interface StoredCredentials {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    createdAt: number; // Timestamp when credentials were created
}
