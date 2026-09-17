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

'use strict';

var System = require('dw/system/System');
var Logger = require('dw/system/Logger');

var log = Logger.getLogger('sfnext-notify', 'sfnext-notify');

/**
 * Resolves the storefront's public-facing hostname for use in magic-link URLs.
 *
 * Reads `sfnextStorefrontHosts` — a comma-separated, org-level preference that acts
 * as an allowlist of permitted storefront hostnames. The `callerHost` supplied by the
 * BFF is validated case-insensitively against this list before being returned, preventing
 * magic-link construction for hosts that are not explicitly configured.
 *
 * Returns null when:
 * - `callerHost` is provided but not in the allowlist
 * - `callerHost` is not provided and the allowlist is empty or unset
 * Callers must treat a null return as a configuration error and abort sending.
 *
 * @param {string} [callerHost] - Hostname supplied by the BFF to validate against the allowlist
 * @returns {string|null} Hostname without protocol or trailing slash, or null if unresolvable
 */
function resolveStorefrontHost(callerHost) {
    var allowedHosts = [];

    try {
        var raw = System.getPreferences().getCustom()['sfnextStorefrontHosts'];
        if (raw && raw.trim()) {
            allowedHosts = raw.split(',').map(function (h) { return h.trim().toLowerCase(); }).filter(Boolean);
        }
    } catch (e) {
        log.warn('Could not read sfnextStorefrontHosts global preference: {0}', e.message);
    }

    if (callerHost) {
        if (allowedHosts.indexOf(callerHost.toLowerCase()) !== -1) {
            return callerHost.toLowerCase();
        }
        log.warn(
            'storefrontHostProvider: caller-supplied host "{0}" is not in the sfnextStorefrontHosts allowlist — email not sent.',
            callerHost
        );
        return null;
    }

    if (allowedHosts.length === 0) {
        log.warn(
            'storefrontHostProvider: no callerHost provided and sfnextStorefrontHosts is not configured. ' +
                'Set sfnextStorefrontHosts in Business Manager > Global Preferences > Custom Preferences > sfnext.'
        );
    } else {
        log.warn('storefrontHostProvider: no callerHost provided — cannot validate against sfnextStorefrontHosts allowlist.');
    }
    return null;
}

module.exports = resolveStorefrontHost;
