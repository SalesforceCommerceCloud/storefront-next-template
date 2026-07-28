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

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { parse as parseDotenv } from 'dotenv';

export interface ScapiConfig {
    clientId: string;
    organizationId: string;
    shortCode: string;
    siteId: string;
    slasSecret?: string;
}

export interface GuestTokens {
    accessToken: string;
    refreshToken: string;
    usid: string;
    customerId: string;
    expiresIn: number;
}

export interface BasketInfo {
    basketId: string;
    totalItemCount: number;
    uniqueProductCount: number;
}

export interface ApiCartResult {
    tokens: GuestTokens;
    basket: BasketInfo;
}

let _appEnvCache: Record<string, string> | null = null;

/**
 * Load and cache the parent storefront app's .env file.
 * Reads commerce API config directly from the app's .env so credentials
 * don't need to be duplicated in the E2E .env.
 */
function loadAppEnv(): Record<string, string> {
    if (_appEnvCache) return _appEnvCache;

    const appEnvPath = resolve(__dirname, '..', '..', '..', '.env');
    if (!existsSync(appEnvPath)) {
        _appEnvCache = {};
        return _appEnvCache;
    }

    _appEnvCache = parseDotenv(readFileSync(appEnvPath));
    return _appEnvCache;
}

/**
 * Build SCAPI config for direct API calls from the test runner.
 *
 * Resolution order: `process.env` first, then the parent storefront app's `.env`
 * file. CI sets these vars on the test-runner process (matching what's deployed
 * to MRT), while local runs typically read them from the storefront app's
 * gitignored `.env`. Returns null if required vars are missing.
 *
 * Reads:
 * - `PUBLIC__app__commerce__api__clientId` (required)
 * - `PUBLIC__app__commerce__api__organizationId` (required)
 * - `PUBLIC__app__commerce__api__shortCode` (required)
 * - `SITE_ID` from process.env only (test-runner concern, never in app .env) (required)
 * - `COMMERCE_API_SLAS_SECRET` (optional — needed for client-credentials grant)
 */
export function getScapiConfig(): ScapiConfig | null {
    const appEnv = loadAppEnv();
    const pickEnv = (key: string): string | undefined => process.env[key] || appEnv[key];

    const clientId = pickEnv('PUBLIC__app__commerce__api__clientId');
    const organizationId = pickEnv('PUBLIC__app__commerce__api__organizationId');
    const shortCode = pickEnv('PUBLIC__app__commerce__api__shortCode');
    const slasSecret = pickEnv('COMMERCE_API_SLAS_SECRET');
    const siteId = process.env.SITE_ID;

    if (!clientId || !organizationId || !shortCode || !siteId) {
        return null;
    }

    return { clientId, organizationId, shortCode, siteId, slasSecret };
}

function getBaseUrl(config: ScapiConfig): string {
    return `https://${config.shortCode}.api.commercecloud.salesforce.com`;
}

/**
 * Returns true for HTTP 409/429 rate-limit errors produced by the SLAS helpers.
 *
 * Two distinct SLAS throttles are both retryable here:
 * - **409** — the ~1/sec per-tenant login gate ("Tenant has already performed
 *   login in last 1 second"). Back-to-back `@core` scenarios — each clearing
 *   cookies and re-authenticating — trip this easily, and the storefront's own
 *   post-signup auto-login adds to the pressure.
 * - **429** — SLAS "Too Many Requests" when several runners hammer the same
 *   tenant concurrently (the burst seen in CI when multiple e2e jobs share a
 *   backend). Fatal-on-429 was the dominant cause of the flaky guest-login
 *   failures, since `loginGuest` had no retry around it.
 *
 * Anchored on the helpers' two error-formatter prefixes — `Status: <code>` or
 * `failed (<code>)` — mirroring `isAuthError` in `token-cache.ts`, so we don't
 * false-positive on a 5xx whose body echoes those digits in a request/correlation
 * id. Note `isAuthError` deliberately matches only 401/403; the rate-limit gates
 * are distinct, retryable conditions handled here, not eviction triggers there.
 *
 * Exported for direct unit testing.
 */
export function isRateLimitError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /(?:Status:\s*(?:409|429)\b|failed\s*\((?:409|429)\))/.test(message);
}

/**
 * Run `fn`, retrying only when it rejects with a SLAS 409/429 rate-limit error
 * (`isRateLimitError`). Any other rejection propagates immediately.
 *
 * The backoff sits at or above the ~1s SLAS gate so the retry lands after the
 * window has cleared: with the defaults (`attempts: 3`, `baseDelayMs: 1200`) the
 * waits are ~1200ms then ~2400ms (linear in attempt number). The final attempt's
 * error is rethrown if every attempt rate-limits.
 *
 * Test-runner code — a real `setTimeout` delay is fine here (this is not a
 * workflow script, so the `Date.now`-free constraint does not apply).
 */
export async function withSlasRetry<T>(
    fn: () => Promise<T>,
    options: { attempts?: number; baseDelayMs?: number } = {}
): Promise<T> {
    const attempts = options.attempts ?? 3;
    const baseDelayMs = options.baseDelayMs ?? 1200;

    // Every path inside the loop either returns the result or throws (on a
    // non-409, or after the final attempt), so there's no fall-through — no
    // trailing throw or `lastError` bookkeeping needed to satisfy the checker.
    for (let attempt = 1; ; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (!isRateLimitError(error) || attempt >= attempts) {
                throw error;
            }
            await new Promise((done) => setTimeout(done, baseDelayMs * attempt));
        }
    }
}

/**
 * Guest login via SLAS.
 *
 * Dispatches based on whether a `slasSecret` is available, mirroring the SDK
 * (`packages/storefront-next-runtime/src/scapi-client/auth/index.ts:195` —
 * `isPrivateClient = !!clientSecret`):
 *
 * - **Private client (secret present):** `client_credentials` grant with
 *   `Authorization: Basic clientId:secret`. SLAS requires the basic-auth header
 *   for this grant; it returns 401 "[invalid Authorization header]" if absent
 *   or if the client is configured public on the server side.
 * - **Public client (no secret):** PKCE flow — generate verifier+challenge,
 *   GET `/oauth2/authorize` with `hint=guest` to get a 303 redirect carrying a
 *   code, then POST `/oauth2/token` with `grant_type=authorization_code_pkce`.
 *   No basic auth, no secret needed.
 *
 * Wrapped in `withSlasRetry` so the guest login — the entry point for every
 * `createCartViaApi` and `createRegisteredShopperViaApi` setup — survives the
 * SLAS 409/429 rate-limit the same way `loginRegistered` does. Each retry re-runs
 * the whole grant (a fresh PKCE verifier/challenge for the public path), so a
 * stale code is never reused.
 */
export async function loginGuest(config: ScapiConfig): Promise<GuestTokens> {
    return withSlasRetry(() => (config.slasSecret ? loginGuestClientCredentials(config) : loginGuestPublic(config)));
}

async function loginGuestClientCredentials(config: ScapiConfig): Promise<GuestTokens> {
    const baseUrl = getBaseUrl(config);
    const tokenUrl = `${baseUrl}/shopper/auth/v1/organizations/${config.organizationId}/oauth2/token`;

    const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.slasSecret}`).toString('base64')}`,
    };

    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        channel_id: config.siteId,
    });

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers,
        body: body.toString(),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`SLAS guest login (client_credentials) failed (${response.status}): ${text}`);
    }

    const data = await response.json();
    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        usid: data.usid,
        customerId: data.customer_id,
        expiresIn: data.expires_in,
    };
}

async function loginGuestPublic(config: ScapiConfig): Promise<GuestTokens> {
    const baseUrl = getBaseUrl(config);
    const appOrigin = process.env.BASE_URL || 'http://localhost:5173';
    const callbackPath =
        process.env.PUBLIC__app__commerce__api__callback ||
        loadAppEnv().PUBLIC__app__commerce__api__callback ||
        '/callback';
    const redirectUri = `${appOrigin}${callbackPath}`;

    const codeVerifier = createCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    const authorizeUrl = new URL(`${baseUrl}/shopper/auth/v1/organizations/${config.organizationId}/oauth2/authorize`);
    authorizeUrl.searchParams.set('client_id', config.clientId);
    authorizeUrl.searchParams.set('channel_id', config.siteId);
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('hint', 'guest');
    authorizeUrl.searchParams.set('code_challenge', codeChallenge);

    const authorizeResponse = await fetch(authorizeUrl.toString(), {
        method: 'GET',
        redirect: 'manual',
    });

    const locationHeader = authorizeResponse.headers.get('location') || '';
    if (!locationHeader) {
        const text = await authorizeResponse.text();
        throw new Error(
            `SLAS guest login (PKCE authorize) failed — no Location header. Status: ${authorizeResponse.status}. Body: ${text}`
        );
    }

    const locationUrl = new URL(locationHeader);
    const code = locationUrl.searchParams.get('code');
    const usid = locationUrl.searchParams.get('usid') || '';

    if (!code) {
        throw new Error(`SLAS guest login (PKCE authorize) — no code in redirect. Status: ${authorizeResponse.status}`);
    }

    const tokenUrl = `${baseUrl}/shopper/auth/v1/organizations/${config.organizationId}/oauth2/token`;
    const tokenBody = new URLSearchParams({
        grant_type: 'authorization_code_pkce',
        client_id: config.clientId,
        channel_id: config.siteId,
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
        usid,
    });

    const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody.toString(),
    });

    if (!tokenResponse.ok) {
        const text = await tokenResponse.text();
        throw new Error(`SLAS guest login (PKCE token exchange) failed (${tokenResponse.status}): ${text}`);
    }

    const data = await tokenResponse.json();
    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        usid: data.usid,
        customerId: data.customer_id,
        expiresIn: data.expires_in,
    };
}

export async function createBasket(
    config: ScapiConfig,
    tokens: GuestTokens,
    currency: string = 'USD'
): Promise<string> {
    const baseUrl = getBaseUrl(config);
    const url =
        `${baseUrl}/checkout/shopper-baskets/v2/organizations/${config.organizationId}/baskets` +
        `?siteId=${config.siteId}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ currency }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Create basket failed (${response.status}): ${text}`);
    }

    const data = await response.json();
    return data.basketId;
}

export async function addItemToBasket(
    config: ScapiConfig,
    tokens: GuestTokens,
    basketId: string,
    productId: string,
    quantity: number = 1
): Promise<BasketInfo> {
    const baseUrl = getBaseUrl(config);
    const url =
        `${baseUrl}/checkout/shopper-baskets/v2/organizations/${config.organizationId}` +
        `/baskets/${basketId}/items?siteId=${config.siteId}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify([{ productId, quantity }]),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Add item to basket failed (${response.status}) for product ${productId}: ${text}`);
    }

    const data = await response.json();
    const productItems = data.productItems ?? [];
    const totalItemCount = productItems.reduce(
        (sum: number, item: { quantity?: number }) => sum + (item.quantity ?? 0),
        0
    );

    return {
        basketId: data.basketId,
        totalItemCount,
        uniqueProductCount: productItems.length,
    };
}

/**
 * Guest login, create basket, and add item in a single sequence.
 * Returns the tokens and basket info needed for cookie injection.
 */
export async function createCartViaApi(
    config: ScapiConfig,
    productId: string,
    options?: { quantity?: number; currency?: string }
): Promise<ApiCartResult> {
    const tokens = await loginGuest(config);
    const basketId = await createBasket(config, tokens, options?.currency);
    const basket = await addItemToBasket(config, tokens, basketId, productId, options?.quantity ?? 1);

    return { tokens, basket };
}

// =========================================================================
// Registered Shopper SCAPI Helpers
// =========================================================================

export interface RegisteredTokens {
    accessToken: string;
    refreshToken: string;
    usid: string;
    customerId: string;
    expiresIn: number;
    /** SLAS-issued encoded user ID, present for registered logins. Mirrors the storefront's `enc_user_id` cookie. */
    encUserId?: string;
}

export interface CustomerAddress {
    addressId: string;
    firstName: string;
    lastName: string;
    address1: string;
    city: string;
    stateCode: string;
    postalCode: string;
    countryCode: string;
    phone: string;
    preferred?: boolean;
}

/**
 * Register a new customer via Shopper Customers API.
 * Requires a guest access token for authorization.
 */
export async function registerCustomer(
    config: ScapiConfig,
    guestTokens: GuestTokens,
    customer: { firstName: string; lastName: string; email: string; password: string }
): Promise<void> {
    const baseUrl = getBaseUrl(config);
    const url =
        `${baseUrl}/customer/shopper-customers/v1/organizations/${config.organizationId}/customers` +
        `?siteId=${config.siteId}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${guestTokens.accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            customer: {
                login: customer.email,
                email: customer.email,
                firstName: customer.firstName,
                lastName: customer.lastName,
            },
            password: customer.password,
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Register customer failed (${response.status}): ${text}`);
    }
}

/**
 * Authenticate as a registered customer via SLAS using the standard PKCE flow:
 * 1. Generate PKCE code verifier + challenge
 * 2. POST /oauth2/login with Basic auth (email:password) -> 303 redirect with code
 * 3. POST /oauth2/token with grant_type=authorization_code_pkce
 *
 * This mirrors the SDK's `loginWithCredentials` implementation.
 */
export async function loginRegistered(
    config: ScapiConfig,
    credentials: { email: string; password: string }
): Promise<RegisteredTokens> {
    const baseUrl = getBaseUrl(config);
    const appOrigin = process.env.BASE_URL || 'http://localhost:5173';
    const callbackPath =
        process.env.PUBLIC__app__commerce__api__callback ||
        loadAppEnv().PUBLIC__app__commerce__api__callback ||
        '/callback';
    const redirectUri = `${appOrigin}${callbackPath}`;

    const authUrl = `${baseUrl}/shopper/auth/v1/organizations/${config.organizationId}/oauth2/login`;

    // Retry the login POST → code extraction on a SLAS 409 rate-limit (~1/sec
    // tenant gate). Each attempt mints a fresh PKCE verifier/challenge because
    // a code is bound to the challenge it was issued against — reusing a stale
    // verifier on retry would fail the subsequent token exchange. The
    // token-exchange POST below is intentionally left outside the retry: it is
    // not the rate-limited request and a 409 cannot originate there.
    const { code, usid, codeVerifier } = await withSlasRetry(async () => {
        const verifier = createCodeVerifier();
        const challenge = await generateCodeChallenge(verifier);

        const authBody = new URLSearchParams({
            client_id: config.clientId,
            channel_id: config.siteId,
            redirect_uri: redirectUri,
            response_type: 'code',
            code_challenge: challenge,
        });

        const authResponse = await fetch(authUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Basic ${Buffer.from(`${credentials.email}:${credentials.password}`).toString('base64')}`,
            },
            body: authBody.toString(),
            redirect: 'manual',
        });

        // SLAS returns a 303 with the code in the Location header on success. On
        // failure (bad credentials, rate limit, server error) it returns a non-3xx
        // with no Location and a JSON body. Surface that explicitly — `new URL("")`
        // throws `TypeError: Invalid URL` which buries the actual SLAS error. The
        // `Status: <code>` suffix is what `isRateLimitError` keys off for the 409 retry.
        const locationHeader = authResponse.headers.get('location');
        if (!locationHeader) {
            const text = await authResponse.text();
            throw new Error(
                `SLAS authenticateCustomer failed — no Location header. Status: ${authResponse.status}. Body: ${text}`
            );
        }

        const locationUrl = new URL(locationHeader);
        const authCode = locationUrl.searchParams.get('code');

        if (!authCode) {
            throw new Error(`SLAS authenticateCustomer failed — no code in redirect. Status: ${authResponse.status}`);
        }

        return {
            code: authCode,
            usid: locationUrl.searchParams.get('usid') || '',
            codeVerifier: verifier,
        };
    });

    const tokenUrl = `${baseUrl}/shopper/auth/v1/organizations/${config.organizationId}/oauth2/token`;

    const tokenHeaders: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
    };
    if (config.slasSecret) {
        tokenHeaders.Authorization = `Basic ${Buffer.from(`${config.clientId}:${config.slasSecret}`).toString('base64')}`;
    }

    const tokenBody = new URLSearchParams({
        grant_type: 'authorization_code_pkce',
        client_id: config.clientId,
        channel_id: config.siteId,
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
        usid,
    });

    const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: tokenHeaders,
        body: tokenBody.toString(),
    });

    if (!tokenResponse.ok) {
        const text = await tokenResponse.text();
        throw new Error(`SLAS token exchange failed (${tokenResponse.status}): ${text}`);
    }

    const data = await tokenResponse.json();
    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        usid: data.usid,
        customerId: data.customer_id,
        expiresIn: data.expires_in,
        encUserId: data.enc_user_id,
    };
}

function createCodeVerifier(): string {
    const URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const randomBytes = new Uint8Array(128);
    crypto.getRandomValues(randomBytes);
    let result = '';
    for (let i = 0; i < randomBytes.length; i++) {
        result += URL_ALPHABET[randomBytes[i] % URL_ALPHABET.length];
    }
    return result;
}

async function generateCodeChallenge(codeVerifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const bytes = new Uint8Array(digest);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Create a customer address via Shopper Customers API.
 */
export async function createCustomerAddress(
    config: ScapiConfig,
    tokens: RegisteredTokens,
    address: CustomerAddress
): Promise<void> {
    const baseUrl = getBaseUrl(config);
    const url =
        `${baseUrl}/customer/shopper-customers/v1/organizations/${config.organizationId}` +
        `/customers/${tokens.customerId}/addresses?siteId=${config.siteId}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(address),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Create customer address failed (${response.status}): ${text}`);
    }
}

/**
 * Update customer profile (e.g. phone number) via Shopper Customers API.
 */
export async function updateCustomerProfile(
    config: ScapiConfig,
    tokens: RegisteredTokens,
    profile: { phoneHome?: string }
): Promise<void> {
    const baseUrl = getBaseUrl(config);
    const url =
        `${baseUrl}/customer/shopper-customers/v1/organizations/${config.organizationId}` +
        `/customers/${tokens.customerId}?siteId=${config.siteId}`;

    const response = await fetch(url, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(profile),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Update customer profile failed (${response.status}): ${text}`);
    }
}

/**
 * Add a payment instrument to the customer profile via Shopper Customers API.
 */
export async function createCustomerPaymentInstrument(
    config: ScapiConfig,
    tokens: RegisteredTokens,
    payment: { cardNumber: string; cardholderName: string; expiryMonth: number; expiryYear: number; cardType: string }
): Promise<void> {
    const baseUrl = getBaseUrl(config);
    const url =
        `${baseUrl}/customer/shopper-customers/v1/organizations/${config.organizationId}` +
        `/customers/${tokens.customerId}/payment-instruments?siteId=${config.siteId}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            paymentCard: {
                number: payment.cardNumber,
                cardType: payment.cardType,
                expirationMonth: payment.expiryMonth,
                expirationYear: payment.expiryYear,
                holder: payment.cardholderName,
            },
            paymentMethodId: 'CREDIT_CARD',
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Create payment instrument failed (${response.status}): ${text}`);
    }
}

export interface RegisteredShopperApiResult {
    tokens: RegisteredTokens;
    signupData: { firstName: string; lastName: string; email: string; password: string };
    addressData: CustomerAddress;
}

/**
 * Full API-based registered shopper setup: register, login, create address,
 * update phone, add payment instrument. No UI interaction required.
 * Returns tokens for cookie injection and data for test assertions.
 */
export async function createRegisteredShopperViaApi(
    config: ScapiConfig,
    options?: { skipPayment?: boolean }
): Promise<RegisteredShopperApiResult> {
    const timestamp = Date.now();
    const suffix = Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, '0');

    const signupData = {
        firstName: `Test${suffix}`,
        lastName: `Shopper${suffix}`,
        email: `shopper_${timestamp}_${suffix}@test.com`,
        password: `Secure@123${suffix}`,
    };

    const addressData: CustomerAddress = {
        addressId: `TestAddr_${timestamp}`,
        firstName: signupData.firstName,
        lastName: signupData.lastName,
        address1: '100 Test Street',
        city: 'Boston',
        stateCode: 'MA',
        postalCode: '02101',
        countryCode: 'US',
        phone: '5551234567',
        preferred: true,
    };

    const guestTokens = await loginGuest(config);
    await registerCustomer(config, guestTokens, signupData);
    const tokens = await loginRegistered(config, signupData);
    await createCustomerAddress(config, tokens, addressData);
    await updateCustomerProfile(config, tokens, { phoneHome: addressData.phone });

    if (!options?.skipPayment) {
        await createCustomerPaymentInstrument(config, tokens, {
            cardNumber: '4242424242424242',
            cardholderName: 'Test Shopper',
            expiryMonth: 1,
            expiryYear: 2030,
            cardType: 'Visa',
        });
    }

    return { tokens, signupData, addressData };
}
