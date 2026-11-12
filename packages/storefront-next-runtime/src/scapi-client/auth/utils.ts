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
 * PKCE and authentication utilities using native Web Crypto APIs.
 *
 * This module provides cryptographic utilities for OAuth 2.0 PKCE flow
 * without any external dependencies, using only native browser/Node.js APIs.
 */

/**
 * Base64 URL-safe encoding of an ArrayBuffer.
 * Converts standard base64 to URL-safe format by replacing +/= characters.
 *
 * @param buffer - The ArrayBuffer to encode
 * @returns URL-safe base64 encoded string
 */
export function base64UrlEncode(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    // Convert to URL-safe base64
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Creates a cryptographically secure random code verifier for PKCE.
 *
 * Uses native Web Crypto API (crypto.getRandomValues) which provides
 * cryptographically secure random values. The output is 128 characters
 * using URL-safe alphabet (A-Za-z0-9-_).
 *
 * @returns A 128-character URL-safe random string suitable for PKCE code_verifier
 */
export function createCodeVerifier(): string {
    const URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const randomBytes = new Uint8Array(128);
    crypto.getRandomValues(randomBytes);

    let result = '';
    for (let i = 0; i < randomBytes.length; i++) {
        result += URL_ALPHABET[randomBytes[i] % URL_ALPHABET.length];
    }
    return result;
}

/**
 * Generates a code challenge from a code verifier using SHA-256.
 *
 * Uses native Web Crypto API (crypto.subtle.digest) to hash the verifier.
 * The result is base64url encoded without padding.
 *
 * @param codeVerifier - The code verifier to hash
 * @returns Promise resolving to the base64url-encoded SHA-256 hash
 * @throws Error if code challenge generation fails
 */
export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const challenge = base64UrlEncode(digest);

    if (challenge.length === 0) {
        throw new Error('Problem generating code challenge');
    }

    return challenge;
}

/**
 * Parse out the code and usid from a redirect URL.
 *
 * @param urlString - A URL that contains `code` and `usid` query parameters,
 *                    typically returned when calling a Shopper Login endpoint
 * @returns An object containing the code and usid
 */
export function getCodeAndUsidFromUrl(urlString: string): { code: string; usid: string } {
    const url = new URL(urlString);
    const urlParams = new URLSearchParams(url.search);
    const usid = urlParams.get('usid') ?? '';
    const code = urlParams.get('code') ?? '';

    return { code, usid };
}

/**
 * Creates a Basic Authentication header value from client credentials.
 *
 * @param clientId - The client ID
 * @param clientSecret - The client secret
 * @returns The Basic auth header value (e.g., "Basic base64encoded...")
 */
export function createBasicAuthHeader(clientId: string, clientSecret: string): string {
    const credentials = `${clientId}:${clientSecret}`;
    const encoded = btoa(credentials);
    return `Basic ${encoded}`;
}

/**
 * Creates the SLAS strict client auth header value (`x-slas-client-auth`) from client credentials.
 *
 * Unlike {@link createBasicAuthHeader}, the value is the raw Base64 encoding with no `Basic ` prefix.
 * SLAS validates it on `/oauth2/login`, where `Authorization` already carries the shopper credentials.
 *
 * @param clientId - The client ID
 * @param clientSecret - The client secret
 * @returns The raw Base64 encoding of `clientId:clientSecret`
 */
export function createSlasClientAuthHeader(clientId: string, clientSecret: string): string {
    return btoa(`${clientId}:${clientSecret}`);
}

/**
 * Extract a cookie value from the Set-Cookie response header.
 *
 * @param response - The fetch Response object
 * @param cookieName - The name of the cookie to extract
 * @returns The cookie value if found, undefined otherwise
 *
 * @example
 * ```typescript
 * const dwsid = extractCookieFromResponse(response, 'dwsid');
 * ```
 */
export function extractCookieFromResponse(response: Response, cookieName: string): string | undefined {
    // Headers.get() is case-insensitive per the Fetch API spec
    // (handles Set-Cookie, set-cookie, SET-COOKIE, etc.)
    const setCookieHeader = response.headers.get('set-cookie');
    if (!setCookieHeader) return undefined;

    // Parse Set-Cookie header for the specified cookie (format: "name=value; Path=/; ...")
    const regex = new RegExp(`${cookieName}=([^;]+)`);
    const match = setCookieHeader.match(regex);
    return match?.[1];
}
