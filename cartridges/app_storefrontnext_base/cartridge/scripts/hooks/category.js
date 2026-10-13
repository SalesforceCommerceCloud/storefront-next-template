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

/**
 * Prunes singular and batched category responses to the fields named by the custom c_select query parameter.
 * Nested categories are pruned recursively. The structural fields id, name, and categories are always retained.
 * If c_select is absent or empty, the response remains unchanged.
 *
 * Hook order determines how pruning interacts with other category response hooks. Fields added by an earlier hook
 * must be included in c_select to survive pruning. Hooks that require omitted fields, or whose output must always be
 * retained, must run after this hook. Configure the cartridge path and hook registration order accordingly.
 *
 * Extension point: dw.ocapi.shop.category.modifyGETResponse
 */

var Logger = require('dw/system/Logger');

// Structural fields kept regardless of c_select so the tree remains valid and keyable.
var ALWAYS_KEEP = Object.create(null);
ALWAYS_KEEP.id = true;
ALWAYS_KEEP.name = true;
ALWAYS_KEEP.categories = true;

/**
 * Parse the c_select value into a lookup of allowed field names.
 * @param {string} raw - comma-separated field list
 * @returns {Object|null} map of fieldName -> true, or null when nothing usable was provided
 */
function parseSelect(raw) {
    if (!raw) {
        return null;
    }
    var allow = Object.create(null);
    var parts = raw.split(',');
    var found = false;
    for (var i = 0; i < parts.length; i += 1) {
        var name = parts[i].replace(/^\s+|\s+$/g, '');
        if (name) {
            allow[name] = true;
            found = true;
        }
    }
    return found ? allow : null;
}

/**
 * Recursively delete every own property of `node` not in `allow` or ALWAYS_KEEP, then recurse into children.
 * @param {Object} node - a Category response document node
 * @param {Object} allow - map of allowed field names
 * @returns {undefined}
 */
function pruneNode(node, allow) {
    if (!node) {
        return;
    }
    var keys = Object.keys(node);
    for (var i = 0; i < keys.length; i += 1) {
        var key = keys[i];
        if (!ALWAYS_KEEP[key] && !allow[key]) {
            delete node[key];
        }
    }
    var children = node.categories;
    if (children && children.length) {
        for (var j = 0; j < children.length; j += 1) {
            pruneNode(children[j], allow);
        }
    }
}

/**
 * @param {dw.catalog.Category} category - Requested category
 * @param {dw.ocapi.shop.category.Category} doc - Category response document
 * @returns {undefined} Platform treats undefined as success and returns the mutated document
 */
function modifyGETResponse(category, doc) {
    try {
        if (!doc) {
            return undefined;
        }
        var allow = parseSelect(request.httpParameterMap.get('c_select').stringValue);
        if (!allow) {
            return undefined;
        }
        pruneNode(doc, allow);
    } catch (e) {
        // Never fail an otherwise-valid category response over a pruning error; return the full doc.
        Logger.error('c_select category prune failed: {0}', e instanceof Error ? e.message : String(e));
    }
    return undefined;
}

exports.modifyGETResponse = modifyGETResponse;
exports.modifyGETResponse.public = true;
