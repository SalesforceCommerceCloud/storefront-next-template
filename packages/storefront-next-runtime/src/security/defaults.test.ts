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
import { defaultCspDirectives, defaultSecurityHeaders } from './defaults';

describe('security defaults', () => {
    it('matches the snapshot — change deliberately and update snapshot when defaults move', () => {
        expect(defaultCspDirectives).toMatchInlineSnapshot(`
          {
            "base-uri": [
              "'self'",
            ],
            "connect-src": [
              "'self'",
              "https://*.commercecloud.salesforce.com",
              "https://*.demandware.net",
              "https://challenges.cloudflare.com",
              "https://api.cquotient.com",
              "https://places.googleapis.com",
              "https://maps.googleapis.com",
            ],
            "default-src": [
              "'self'",
            ],
            "font-src": [
              "'self'",
              "data:",
            ],
            "form-action": [
              "'self'",
            ],
            "frame-ancestors": [
              "'self'",
            ],
            "frame-src": [
              "https://challenges.cloudflare.com",
            ],
            "img-src": [
              "'self'",
              "data:",
              "https://*.commercecloud.salesforce.com",
              "https://*.demandware.net",
              "https://*.cc.salesforce.com",
            ],
            "object-src": [
              "'none'",
            ],
            "script-src": [
              "'self'",
              "https://challenges.cloudflare.com",
              "https://maps.googleapis.com",
            ],
            "style-src": [
              "'self'",
              "'unsafe-inline'",
            ],
            "upgrade-insecure-requests": true,
          }
        `);
        expect(defaultSecurityHeaders).toMatchInlineSnapshot(`
          {
            "contentTypeOptions": "nosniff",
            "csp": {
              "directives": {
                "base-uri": [
                  "'self'",
                ],
                "connect-src": [
                  "'self'",
                  "https://*.commercecloud.salesforce.com",
                  "https://*.demandware.net",
                  "https://challenges.cloudflare.com",
                  "https://api.cquotient.com",
                  "https://places.googleapis.com",
                  "https://maps.googleapis.com",
                ],
                "default-src": [
                  "'self'",
                ],
                "font-src": [
                  "'self'",
                  "data:",
                ],
                "form-action": [
                  "'self'",
                ],
                "frame-ancestors": [
                  "'self'",
                ],
                "frame-src": [
                  "https://challenges.cloudflare.com",
                ],
                "img-src": [
                  "'self'",
                  "data:",
                  "https://*.commercecloud.salesforce.com",
                  "https://*.demandware.net",
                  "https://*.cc.salesforce.com",
                ],
                "object-src": [
                  "'none'",
                ],
                "script-src": [
                  "'self'",
                  "https://challenges.cloudflare.com",
                  "https://maps.googleapis.com",
                ],
                "style-src": [
                  "'self'",
                  "'unsafe-inline'",
                ],
                "upgrade-insecure-requests": true,
              },
              "reportOnly": false,
            },
            "enabled": true,
            "frameOptions": "SAMEORIGIN",
            "hsts": {
              "includeSubDomains": true,
              "maxAge": 15552000,
              "preload": false,
            },
            "permissionsPolicy": {
              "camera": [],
              "geolocation": [],
              "microphone": [],
            },
            "referrerPolicy": "strict-origin-when-cross-origin",
          }
        `);
    });

    it('script-src contains self', () => {
        expect(defaultCspDirectives['script-src']).toContain("'self'");
    });

    it('object-src is none', () => {
        expect(defaultCspDirectives['object-src']).toEqual(["'none'"]);
    });

    it('connect-src allows the Einstein engagement API host (OOTB browser beacons)', () => {
        // The OOTB Einstein engagement adapter fires browser `navigator.sendBeacon`
        // calls to https://api.cquotient.com/v3/activities/... — a cross-origin
        // request governed by connect-src. Without this entry the beacons are
        // blocked by CSP and the browser console reports a violation.
        expect(defaultCspDirectives['connect-src']).toContain('https://api.cquotient.com');
    });

    it('referrer policy is strict-origin-when-cross-origin', () => {
        expect(defaultSecurityHeaders.referrerPolicy).toBe('strict-origin-when-cross-origin');
    });

    it('documents *.cc.salesforce.com as a Tier-1 DIS image host (img-src)', () => {
        // *.cc.salesforce.com serves B2C Commerce / DIS imagery for every storefront
        // (see template dynamic-image.ts). It is universal (Tier 1), not feature-gated.
        expect(defaultCspDirectives['img-src']).toContain('https://*.cc.salesforce.com');
    });

    it('keeps feature-specific (Tier-2) origins OUT of the universal defaults', () => {
        // Tier-2 hosts belong to opt-in features and must arrive via a CSP contributor
        // (template), never the SDK defaults. Guards against the PR #1956 regression
        // (embedded-messaging wildcards) and similar leaks.
        const tier2Hosts = ['my.site.com', 'salesforce-scrt.com', 'pc-rnd.site.com'];
        const flat = JSON.stringify(defaultCspDirectives);
        for (const host of tier2Hosts) {
            expect(flat).not.toContain(host);
        }
    });
});
