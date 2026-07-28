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
 * Whether this browser can create a passkey via `navigator.credentials.create()`.
 * `parseCreationOptionsFromJSON` is required to decode SLAS's base64url-encoded
 * challenge/user.id into the ArrayBuffers the creation call needs — without it
 * (Safari 17, Chrome <129), registration would always fail after the ceremony starts.
 */
export function isPasskeyCreateSupported(): boolean {
    return (
        typeof window !== 'undefined' &&
        typeof window.PublicKeyCredential !== 'undefined' &&
        typeof window.PublicKeyCredential.parseCreationOptionsFromJSON === 'function'
    );
}
