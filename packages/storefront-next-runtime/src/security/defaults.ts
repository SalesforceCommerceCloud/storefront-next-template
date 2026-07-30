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
import type { CspDirectives, ResolvedSecurityConfig } from './types.js';

/**
 * SDK default CSP directives. Customers extending CSP should spread this:
 *
 * ```ts
 * import { defaultCspDirectives } from '@salesforce/storefront-next-runtime/security';
 * security: {
 *   csp: {
 *     directives: {
 *       ...defaultCspDirectives,
 *       'script-src': [...defaultCspDirectives['script-src']!, 'https://cdn.foo.com'],
 *     },
 *   },
 * }
 * ```
 *
 * The per-request nonce is appended to `script-src` at request time; it is
 * NOT in this static map.
 */
export const defaultCspDirectives: CspDirectives = {
    'default-src': ["'self'"],
    'script-src': ["'self'", 'https://challenges.cloudflare.com'],
    // Tailwind v4 + shadcn rely on inline styles. Removing 'unsafe-inline'
    // breaks the design system out of the box.
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': [
        "'self'",
        'data:',
        'https://*.commercecloud.salesforce.com',
        'https://*.demandware.net',
        'https://*.cc.salesforce.com',
    ],
    'font-src': ["'self'", 'data:'],
    'connect-src': [
        "'self'",
        'https://*.commercecloud.salesforce.com',
        'https://*.demandware.net',
        // Browser-initiated XHR/fetch from the Cloudflare Turnstile widget after
        // its api.js loads. (The server-side siteverify call is not subject to CSP.)
        'https://challenges.cloudflare.com',
        // Browser `navigator.sendBeacon` calls from the OOTB Einstein engagement
        // adapter to the CQuotient activities API (e.g. viewPage/viewProduct).
        'https://api.cquotient.com',
        // Browser fetch/XHR to the Google Maps Places API for address autocomplete
        // during checkout (Places "New" AutocompleteSuggestion + the Maps JS loader).
        'https://places.googleapis.com',
        'https://maps.googleapis.com',
    ],
    // Cloudflare Turnstile widget iframe.
    'frame-src': ['https://challenges.cloudflare.com'],
    // Modern equivalent of X-Frame-Options. Strict by default; the security
    // middleware relaxes this per-request for Page Designer / Business Manager
    // preview embeds (mode=EDIT|PREVIEW). See `pageDesignerFrameAncestors`.
    'frame-ancestors': ["'self'"],
    // Restrict form submissions to same-origin. CSP3 does NOT fall back to
    // default-src for form-action; without this, forms could POST anywhere.
    'form-action': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'upgrade-insecure-requests': true,
};

/**
 * Salesforce-owned host families that may legitimately embed the storefront
 * in an iframe — Business Manager / Page Designer editor and preview frames.
 *
 * Used by the security middleware to relax `frame-ancestors` only on requests
 * that are actually Page Designer EDIT/PREVIEW (`?mode=EDIT|PREVIEW`). Normal
 * shopper traffic continues to ship `frame-ancestors 'self'`.
 *
 * Wildcards are bounded to Salesforce-registrable domains; only Salesforce
 * can issue subdomains under these zones.
 */
export const pageDesignerFrameAncestors: string[] = [
    'https://*.unified.demandware.net',
    'https://*.commercecloud.salesforce.com',
    'https://*.demandware.net',
];

export const defaultSecurityHeaders: ResolvedSecurityConfig = {
    enabled: true,
    csp: { directives: defaultCspDirectives, reportOnly: false },
    hsts: { maxAge: 15552000, includeSubDomains: true, preload: false },
    frameOptions: 'SAMEORIGIN',
    contentTypeOptions: 'nosniff',
    referrerPolicy: 'strict-origin-when-cross-origin',
    permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
};
