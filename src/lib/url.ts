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
const toBase64Url = (b64: string) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

const fromBase64Url = (b64url: string) => {
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    if (pad === 1) {
        throw new TypeError('Malformed base64url input');
    }
    return pad ? `${b64}${'='.repeat(4 - pad)}` : b64;
};

// Bytes <-> Base64 (isomorphic)
export const bytesToBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        const sub = bytes.subarray(i, i + chunk);
        binary += String.fromCharCode(...sub);
    }
    return btoa(binary);
};

const base64ToBytes = (b64: string): Uint8Array => {
    const binary = atob(b64);
    const len = binary.length;
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        out[i] = binary.charCodeAt(i);
    }
    return out;
};

/**
 * Converts a given string into a UTF-8-safe Base64URL string - i.e., supports Emojis, umlauts, etc. - that can
 * be safely used in URL path segments.
 */
export const encodeBase64Url = (input: string): string => {
    return toBase64Url(bytesToBase64(new TextEncoder().encode(input)));
};

/**
 * Decodes a Base64URL string back to a plain string. Throws in case of invalid input.
 */
export const decodeBase64Url = (input: string) => {
    return new TextDecoder('utf-8', { fatal: true }).decode(base64ToBytes(fromBase64Url(input)));
};

/**
 * Builds a search URL with the given query
 */
export const searchUrlBuilder = (query: string): string => {
    return `/search?q=${encodeURIComponent(query)}`;
};
