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
 * Whether the current browser can complete passkey registration. Registration decodes SLAS's
 * base64url-encoded challenge/user.id via `PublicKeyCredential.parseCreationOptionsFromJSON`
 * before calling `navigator.credentials.create()`; without it (Safari 17, Chrome <129) the
 * ceremony always fails. Callers gate registration entry points on this so shoppers on
 * unsupported browsers aren't led into a flow that can only fail. Returns false during SSR.
 */
export function isPasskeyRegistrationSupported(): boolean {
    return (
        typeof window !== 'undefined' &&
        typeof window.PublicKeyCredential !== 'undefined' &&
        typeof window.PublicKeyCredential.parseCreationOptionsFromJSON === 'function'
    );
}

/**
 * Encodes an `ArrayBuffer` as base64url — the encoding WebAuthn ceremony fields use, not
 * standard base64 (`+`/`/`/`=` are not part of it). Chunks the buffer before spreading into
 * `String.fromCharCode` so a large credential response can't blow the call stack.
 *
 * Used by both the login assertion path and the registration attestation fallback (when a
 * browser lacks `PublicKeyCredential.toJSON`), so the two stay byte-for-byte consistent.
 */
export function bufferToBase64Url(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
