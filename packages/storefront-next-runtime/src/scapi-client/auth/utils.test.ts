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
import { describe, it, expect } from 'vitest';
import {
    base64UrlEncode,
    createCodeVerifier,
    generateCodeChallenge,
    getCodeAndUsidFromUrl,
    createBasicAuthHeader,
    createSlasClientAuthHeader,
    extractCookieFromResponse,
} from './utils';

describe('auth/utils', () => {
    describe('base64UrlEncode', () => {
        it('should encode an ArrayBuffer to URL-safe base64', () => {
            const data = new TextEncoder().encode('hello world');
            const result = base64UrlEncode(data.buffer);

            // Should not contain +, /, or =
            expect(result).not.toContain('+');
            expect(result).not.toContain('/');
            expect(result).not.toContain('=');

            // Should be non-empty
            expect(result.length).toBeGreaterThan(0);
        });

        it('should produce consistent output for same input', () => {
            const data = new TextEncoder().encode('test');
            const result1 = base64UrlEncode(data.buffer);
            const result2 = base64UrlEncode(new TextEncoder().encode('test').buffer);

            expect(result1).toBe(result2);
        });

        it('should handle empty buffer', () => {
            const result = base64UrlEncode(new ArrayBuffer(0));
            expect(result).toBe('');
        });
    });

    describe('createCodeVerifier', () => {
        it('should create a 128 character string', () => {
            const verifier = createCodeVerifier();
            expect(verifier.length).toBe(128);
        });

        it('should only contain URL-safe characters', () => {
            const verifier = createCodeVerifier();
            // URL-safe alphabet: A-Za-z0-9-_
            expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
        });

        it('should generate unique values', () => {
            const verifier1 = createCodeVerifier();
            const verifier2 = createCodeVerifier();

            expect(verifier1).not.toBe(verifier2);
        });

        it('should be cryptographically random', () => {
            // Generate multiple verifiers and check they have good distribution
            const verifiers = Array.from({ length: 100 }, () => createCodeVerifier());
            const uniqueVerifiers = new Set(verifiers);

            expect(uniqueVerifiers.size).toBe(100);
        });
    });

    describe('generateCodeChallenge', () => {
        it('should generate a code challenge from verifier', async () => {
            const verifier = createCodeVerifier();
            const challenge = await generateCodeChallenge(verifier);

            expect(challenge.length).toBeGreaterThan(0);
            // Should be URL-safe base64 (no +, /, =)
            expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
        });

        it('should produce consistent output for same input', async () => {
            const verifier = 'test-verifier-string';
            const challenge1 = await generateCodeChallenge(verifier);
            const challenge2 = await generateCodeChallenge(verifier);

            expect(challenge1).toBe(challenge2);
        });

        it('should produce different output for different input', async () => {
            const challenge1 = await generateCodeChallenge('verifier1');
            const challenge2 = await generateCodeChallenge('verifier2');

            expect(challenge1).not.toBe(challenge2);
        });

        it('should produce SHA-256 hash length (43 characters for URL-safe base64)', async () => {
            const verifier = createCodeVerifier();
            const challenge = await generateCodeChallenge(verifier);

            // SHA-256 produces 32 bytes, base64 encoded = 43 characters (without padding)
            expect(challenge.length).toBe(43);
        });
    });

    describe('getCodeAndUsidFromUrl', () => {
        it('should extract code and usid from URL', () => {
            const url = 'https://example.com/callback?code=abc123&usid=user-456';
            const result = getCodeAndUsidFromUrl(url);

            expect(result.code).toBe('abc123');
            expect(result.usid).toBe('user-456');
        });

        it('should return empty strings when params are missing', () => {
            const url = 'https://example.com/callback';
            const result = getCodeAndUsidFromUrl(url);

            expect(result.code).toBe('');
            expect(result.usid).toBe('');
        });

        it('should handle URL with only code', () => {
            const url = 'https://example.com/callback?code=abc123';
            const result = getCodeAndUsidFromUrl(url);

            expect(result.code).toBe('abc123');
            expect(result.usid).toBe('');
        });

        it('should handle URL with only usid', () => {
            const url = 'https://example.com/callback?usid=user-456';
            const result = getCodeAndUsidFromUrl(url);

            expect(result.code).toBe('');
            expect(result.usid).toBe('user-456');
        });

        it('should handle URL with additional parameters', () => {
            const url = 'https://example.com/callback?code=abc123&usid=user-456&state=xyz&extra=param';
            const result = getCodeAndUsidFromUrl(url);

            expect(result.code).toBe('abc123');
            expect(result.usid).toBe('user-456');
        });

        it('should handle URL-encoded values', () => {
            const url = 'https://example.com/callback?code=abc%2B123&usid=user%3D456';
            const result = getCodeAndUsidFromUrl(url);

            expect(result.code).toBe('abc+123');
            expect(result.usid).toBe('user=456');
        });
    });

    describe('createBasicAuthHeader', () => {
        it('should create a Basic auth header', () => {
            const header = createBasicAuthHeader('client-id', 'client-secret');

            expect(header).toMatch(/^Basic /);
        });

        it('should base64 encode clientId:clientSecret', () => {
            const header = createBasicAuthHeader('myClient', 'mySecret');
            const encoded = header.replace('Basic ', '');
            const decoded = atob(encoded);

            expect(decoded).toBe('myClient:mySecret');
        });

        it('should handle special characters', () => {
            const header = createBasicAuthHeader('client:with:colons', 'secret+with+plus');
            const encoded = header.replace('Basic ', '');
            const decoded = atob(encoded);

            expect(decoded).toBe('client:with:colons:secret+with+plus');
        });
    });

    describe('createSlasClientAuthHeader', () => {
        it('should return raw base64 of clientId:clientSecret without a Basic prefix', () => {
            const header = createSlasClientAuthHeader('myClient', 'mySecret');

            expect(header).not.toMatch(/^Basic /);
            expect(atob(header)).toBe('myClient:mySecret');
        });

        it('should match the encoded portion of the Basic auth header', () => {
            expect(createSlasClientAuthHeader('client-id', 'client-secret')).toBe(
                createBasicAuthHeader('client-id', 'client-secret').replace('Basic ', '')
            );
        });

        it('should handle special characters', () => {
            const header = createSlasClientAuthHeader('client:with:colons', 'secret+with+plus');

            expect(atob(header)).toBe('client:with:colons:secret+with+plus');
        });
    });

    describe('extractCookieFromResponse', () => {
        const createMockResponse = (setCookieHeader?: string | null) => {
            const headers = {
                get: (name: string) => (name.toLowerCase() === 'set-cookie' ? (setCookieHeader ?? null) : null),
            } as unknown as Headers;

            return {
                headers,
            } as unknown as Response;
        };

        it('should return undefined when Set-Cookie header is missing', () => {
            const response = createMockResponse(undefined);

            const result = extractCookieFromResponse(response, 'dwsid');

            expect(result).toBeUndefined();
        });

        it('should return undefined when cookie is not present in header', () => {
            const response = createMockResponse('other=value; Path=/; HttpOnly');

            const result = extractCookieFromResponse(response, 'dwsid');

            expect(result).toBeUndefined();
        });

        it('should return cookie value when present in header', () => {
            const response = createMockResponse('dwsid=my-cookie-value; Path=/; HttpOnly');

            const result = extractCookieFromResponse(response, 'dwsid');

            expect(result).toBe('my-cookie-value');
        });
    });
});
