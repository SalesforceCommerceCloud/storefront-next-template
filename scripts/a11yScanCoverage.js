#!/usr/bin/env node
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
 * e2e a11y axe-scan coverage guard.
 *
 * The blocking e2e a11y axe scan (`e2e/src/specs/core/a11y/*.spec.ts`, ratcheted
 * against `e2e/a11y-baseline.json`) scans a hand-wired list of pages. A page or
 * route added later is not covered automatically. Someone has to remember to add
 * a `Scenario()` and a baseline key, or the page ships with no runtime a11y gate.
 *
 * This guard flips the default from remember-to-add-a-scenario to
 * CI-won't-let-you-forget, the same way `storyCoverageReport.js` guards story
 * coverage. It reconciles three sources of truth, statically (no server, no build):
 *
 *   1. Page routes on disk:        `src/routes/`, `src/extensions/<x>/routes/`,
 *                                  `src/verticals/<x>/routes/` (flatRoutes surface).
 *   2. Scan keys in the specs:     every `beginScan('<key>')` in the a11y specs.
 *   3. This file's two tables:     SCANNED_ROUTES (route-id -> scan key) and
 *                                  ALLOWLIST (route-id -> reason it is out of scope).
 *
 * A page route MUST be either scanned (in SCANNED_ROUTES, mapped to a key that
 * actually exists in the specs) or explicitly allowlisted with a reason. The guard
 * fails CI on any of:
 *
 *   - a page route in neither table               (new page with no a11y gate)
 *   - a SCANNED_ROUTES / ALLOWLIST route-id that   (stale table entry: route deleted
 *     no longer exists on disk                      or renamed)
 *   - a SCANNED_ROUTES key with no matching         (Scenario removed but map not updated)
 *     `beginScan` in the specs
 *   - a `beginScan` key claimed by no              (scan added but map not updated)
 *     SCANNED_ROUTES entry
 *   - a route-id in BOTH tables                     (contradiction)
 *
 * Scope (W-23461306): coverage guard only. It forces a scenario to *exist*; a human
 * still authors the interaction state to scan. Driving states generically and wiring
 * the auth/cart-gated pages (auto-discovery) is the deferred follow-up. Those pages
 * sit in ALLOWLIST under `deferred:auto-discovery` today.
 *
 * Exit code 0 when every page route is accounted for, 1 otherwise.
 */

import fs from 'fs';
import path from 'path';

const TEMPLATE_DIR = process.cwd();
const A11Y_SPEC_DIR = path.join(TEMPLATE_DIR, 'e2e/src/specs/core/a11y');

// Directories whose direct `*.tsx` children are flatRoutes page routes. Nested
// dirs (routes/types/, lib/revalidation/routes/, tests/routes/) are intentionally
// excluded: a single-level glob per root keeps non-page modules out.
const ROUTE_GLOBS = [
    'src/routes',
    // one entry per extension/vertical `routes/` dir, expanded below
];

// -----------------------------------------------------------------------------
// SCANNED_ROUTES: a page route whose accessibility is covered by the e2e axe
// scan. Maps the route-id (flatRoutes filename without extension) to the
// `beginScan('<key>')` key the corresponding Scenario uses. Both sides are
// checked against reality: the route-id must exist on disk and the key must
// appear in the specs.
// -----------------------------------------------------------------------------
const SCANNED_ROUTES = {
    '_app._index': 'homepage',
    '_app.category.$categoryId': 'plp',
    '_app.product.$productId': 'pdp',
    '_app.search': 'search',
    '_app.cart': 'cart',
    '_checkout.checkout': 'checkout',
    '_empty.login': 'login',
    '_empty.signup': 'signup',
    '_app.account._index': 'account-details',
    '_app.account.addresses': 'account-addresses',
    '_app.account.payment-methods': 'account-payment-methods',
    '_app.account.wishlist': 'account-wishlist',
    '_app.account.orders._index': 'order-list',
    '_app.account.orders.$orderNo': 'order-details',
};

// -----------------------------------------------------------------------------
// ALLOWLIST: page routes deliberately out of the axe scan, each with a reason.
// Reviewers should scrutinise additions here: a new page belongs in SCANNED_ROUTES
// (with a Scenario) unless one of these categories genuinely applies.
// -----------------------------------------------------------------------------
const ALLOWLIST = {
    // Layout routes: render only an <Outlet/>, no addressable URL of their own.
    // Their content is scanned through the child page routes.
    _app: 'layout: renders <Outlet/>, no standalone page to scan',
    '_app.account': 'layout: renders <Outlet/>, no standalone page to scan',
    '_app.account.orders': 'layout: renders <Outlet/>, no standalone page to scan',
    _checkout: 'layout: renders <Outlet/>, no standalone page to scan',
    _empty: 'layout: renders <Outlet/>, no standalone page to scan',

    // Redirect-only: no rendered content of its own; guests land on /account/wishlist,
    // which is scanned as `account-wishlist`.
    '_app.wishlist': 'redirect-only: forwards to /account/wishlist (scanned)',

    // Non-visual handlers: return a Response, not a themed page.
    '_empty.$': 'non-visual: catch-all that throws a 404 Response, no page chrome',
    '_empty.preview.component': 'non-visual: Page Designer preview harness, 404 unless in preview context',
    '_empty.logout': 'non-visual: server action only, invalidates the session and redirects, no rendered page',
    '_empty.oauth2.jwks': 'non-visual: JWKS proxy loader, returns an application/json Response, no page chrome',

    // Real pages not yet scanned. Deferred to the auto-discovery follow-up
    // (W-23461306 scope note): several are auth-, order-, or ops-gated and need
    // generic state/credential wiring before they can scan reliably.
    '_app.about-us': 'deferred:auto-discovery,static content page, no Scenario yet',
    '_app.size-guide': 'deferred:auto-discovery,vertical-exclusive (footwear) static page, no Scenario yet',
    '_app.account.overview': 'deferred:auto-discovery,auth-gated, no Scenario yet',
    '_app.account.passkeys': 'deferred:auto-discovery,auth-gated, no Scenario yet',
    '_app.account.store-preferences': 'deferred:auto-discovery,auth-gated, no Scenario yet',
    '_app.order-confirmation.$orderNo': 'deferred:auto-discovery,requires a placed order, no Scenario yet',
    '_app.order-lookup._index': 'deferred:auto-discovery,multi-step OTP-gated flow, no Scenario yet',
    '_app.order-lookup.results': 'deferred:auto-discovery,multi-step OTP-gated flow, no Scenario yet',
    '_app.store-locator': 'deferred:auto-discovery,extension page, no Scenario yet',
    '_empty.forgot-password': 'deferred:auto-discovery,no Scenario yet',
    '_empty.reset-password': 'deferred:auto-discovery,token-gated, no Scenario yet',
    '_empty.maintenance': 'deferred:auto-discovery,ops page, no Scenario yet',
};

// =============================================================================
// Discovery
// =============================================================================

/** Expand ROUTE_GLOBS to include every extension/vertical `routes/` dir. */
function routeRoots() {
    const roots = [...ROUTE_GLOBS];
    for (const group of ['src/extensions', 'src/verticals']) {
        const groupDir = path.join(TEMPLATE_DIR, group);
        if (!fs.existsSync(groupDir)) continue;
        for (const name of fs.readdirSync(groupDir)) {
            const candidate = path.join(group, name, 'routes');
            if (fs.existsSync(path.join(TEMPLATE_DIR, candidate))) roots.push(candidate);
        }
    }
    return roots;
}

/**
 * The set of page route-ids on disk. A page route is a direct `*.ts`/`*.tsx`
 * child of a `routes/` root that is not a test/story/snapshot/`.d.ts` file and
 * not a `resource.` or `action.` route (those have no rendered page). flatRoutes
 * accepts either extension — a page route can be authored as `.ts`
 * (React.createElement, no JSX) as well as `.tsx`, so matching only `.tsx` let a
 * `.ts` page ship with no scan coverage. Verticals override a base route of the
 * same filename, so route-ids collapse by basename across all roots.
 */
function discoverPageRoutes() {
    const routeIds = new Set();
    for (const root of routeRoots()) {
        const dir = path.join(TEMPLATE_DIR, root);
        if (!fs.existsSync(dir)) continue;
        for (const file of fs.readdirSync(dir)) {
            const ext = file.endsWith('.tsx') ? '.tsx' : file.endsWith('.ts') ? '.ts' : null;
            if (!ext) continue;
            if (file.endsWith('.d.ts')) continue;
            if (/\.(test|stories)\.tsx?$/.test(file) || /-snapshot\.tsx?$/.test(file)) continue;
            if (/^(resource|action)\./.test(file)) continue;
            routeIds.add(file.slice(0, -ext.length));
        }
    }
    return routeIds;
}

/** Every `beginScan('<key>')` key referenced in the a11y specs. */
function discoverScanKeys() {
    const keys = new Set();
    if (!fs.existsSync(A11Y_SPEC_DIR)) return keys;
    const re = /beginScan\(\s*['"]([^'"]+)['"]/g;
    for (const file of fs.readdirSync(A11Y_SPEC_DIR)) {
        if (!file.endsWith('.spec.ts')) continue;
        const src = fs.readFileSync(path.join(A11Y_SPEC_DIR, file), 'utf8');
        for (const m of src.matchAll(re)) keys.add(m[1]);
    }
    return keys;
}

// =============================================================================
// Reconcile
// =============================================================================

function main() {
    const pageRoutes = discoverPageRoutes();
    const scanKeys = discoverScanKeys();
    const errors = [];

    // 1. Tables must not disagree with each other.
    for (const id of Object.keys(SCANNED_ROUTES)) {
        if (id in ALLOWLIST) errors.push(`Route "${id}" is in BOTH SCANNED_ROUTES and ALLOWLIST. Pick one.`);
    }

    // 2. Every table entry must point at a route that still exists on disk.
    for (const id of Object.keys(SCANNED_ROUTES)) {
        if (!pageRoutes.has(id)) {
            errors.push(`SCANNED_ROUTES entry "${id}" no longer exists on disk. Remove it or fix the id.`);
        }
    }
    for (const id of Object.keys(ALLOWLIST)) {
        if (!pageRoutes.has(id)) {
            errors.push(`ALLOWLIST entry "${id}" no longer exists on disk. Remove it or fix the id.`);
        }
    }

    // 3. Every mapped scan key must actually appear in the specs.
    for (const [id, key] of Object.entries(SCANNED_ROUTES)) {
        if (!scanKeys.has(key)) {
            errors.push(
                `SCANNED_ROUTES maps "${id}" -> beginScan('${key}'), but no spec calls beginScan('${key}'). ` +
                    `Did the Scenario get removed or the key renamed?`
            );
        }
    }

    // 4. Every scan key in the specs must be claimed by exactly one SCANNED_ROUTES
    // entry. Count claims per key: 0 = orphan scan (below), >1 = two routes share a
    // key, which makes coverage ambiguous (a green scan for one route reads as
    // covering the other) and hides a copy-paste mapping error.
    const claimsByKey = new Map();
    for (const [id, key] of Object.entries(SCANNED_ROUTES)) {
        if (!claimsByKey.has(key)) claimsByKey.set(key, []);
        claimsByKey.get(key).push(id);
    }
    for (const [key, ids] of claimsByKey) {
        if (ids.length > 1) {
            errors.push(
                `Scan key '${key}' is claimed by ${ids.length} SCANNED_ROUTES entries (${ids.join(', ')}). ` +
                    `Each key must map from exactly one route so coverage stays unambiguous. ` +
                    `Give each route its own beginScan key.`
            );
        }
    }
    for (const key of scanKeys) {
        if (!claimsByKey.has(key)) {
            errors.push(
                `Spec calls beginScan('${key}') but no SCANNED_ROUTES entry maps to it. ` +
                    `Add the route-id -> '${key}' mapping so coverage stays traceable.`
            );
        }
    }

    // 5. THE GUARD: every page route must be scanned or allowlisted.
    const uncovered = [];
    for (const id of [...pageRoutes].sort()) {
        if (id in SCANNED_ROUTES || id in ALLOWLIST) continue;
        uncovered.push(id);
    }
    for (const id of uncovered) {
        errors.push(
            `Page route "${id}" has no e2e a11y scan. Add a Scenario in e2e/src/specs/core/a11y/ ` +
                `and map it in SCANNED_ROUTES, or add it to ALLOWLIST with a reason.`
        );
    }

    // -------------------------------------------------------------------------
    // Report
    // -------------------------------------------------------------------------
    const scannedCount = Object.keys(SCANNED_ROUTES).length;
    const allowlistCount = Object.keys(ALLOWLIST).length;
    console.log('e2e a11y axe-scan coverage guard');
    console.log(
        `  ${pageRoutes.size} page routes: ${scannedCount} scanned, ${allowlistCount} allowlisted, ${uncovered.length} uncovered`
    );

    if (errors.length === 0) {
        console.log('✔️ every page route is scanned or explicitly allowlisted');
        process.exit(0);
    }

    console.error(`\n❌ a11y scan coverage guard failed (${errors.length} problem(s)):\n`);
    for (const e of errors) console.error(`  - ${e}`);
    console.error('');
    process.exit(1);
}

main();
