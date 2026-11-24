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
 * Adds opted-in custom site and global preferences to the Shopper Configurations response, so storefronts hosted
 * without the MRT data store can read them through a Shopper API.
 *
 * Only attributes assigned to the sfnextShopperConfiguration attribute group are exposed. The group is defined on
 * both SitePreferences and OrganizationPreferences, ships empty, and is managed under Administration > Site
 * Development > System Object Types > Attribute Grouping. Password attributes are never exposed, even when
 * assigned to the group. Like the MRT data store sync, no other attribute is filtered by name, so the group must only
 * hold values that are safe to make public.
 *
 * The response is public to any shopper token and cached per site, so values are read once in the request locale and
 * are not personalized. Exposed values are added as c_customSitePreferences and c_customGlobalPreferences in the same
 * shape the MRT data store sync writes: { data: [{ groupId, id, value }] }. Like that sync, attributes with neither a
 * value nor a default are omitted, and image values are { path, absUrl, disBaseUrl, alt, title }.
 *
 * Extension point: dw.shop.shopper_configuration.modifyGETResponse
 */

var Logger = require('dw/system/Logger');
var ObjectAttributeDefinition = require('dw/object/ObjectAttributeDefinition');
var Site = require('dw/system/Site');
var System = require('dw/system/System');
var SystemObjectMgr = require('dw/object/SystemObjectMgr');

var EXPOSED_GROUP_ID = 'sfnextShopperConfiguration';

// Static content URLs have the form /on/demandware.static/{site}/{unit}/{locale}/{fingerprint}/{path}.
var STATIC_PATH_PATTERN = /\/on\/demandware\.static\/[^/]+\/[^/]+\/[^/]+\/[^/]+\/([^?#]+)/;
var DIS_ENDPOINT = '/dw/image/v2/';

/**
 * Recover the stored media file path, which the script API does not expose, from its static content URL.
 * @param {dw.web.URL} url - relative or CDN URL of the media file
 * @returns {string|null} path relative to the media file's library or catalog, or null when the URL has another form
 */
function mediaFilePath(url) {
    var match = url ? STATIC_PATH_PATTERN.exec(url.toString()) : null;
    if (!match) {
        return null;
    }
    try {
        return decodeURIComponent(match[1]);
    } catch (e) {
        return match[1];
    }
}

/**
 * Derive the Dynamic Imaging Service base URL: a transformed image URL without its transformation parameters.
 * @param {dw.content.MediaFile} mediaFile - image value
 * @returns {string|null} DIS base URL, or null when the image is not served through DIS
 */
function disBaseUrl(mediaFile) {
    var url = mediaFile.getAbsImageURL({ scaleWidth: 1 });
    var value = url ? url.toString() : '';
    return value.indexOf(DIS_ENDPOINT) === -1 ? null : value.split('?')[0];
}

/**
 * Convert an image value to the media file shape the MRT data store sync writes.
 * @param {dw.content.MediaFile} mediaFile - image value
 * @returns {Object} path, absUrl, disBaseUrl, alt, and title of the image
 */
function serializeImage(mediaFile) {
    var absUrl = mediaFile.getAbsImageURL(null);
    return {
        path: mediaFilePath(mediaFile.getURL()),
        absUrl: absUrl ? absUrl.toString() : null,
        disBaseUrl: disBaseUrl(mediaFile),
        alt: mediaFile.getAlt(),
        title: mediaFile.getTitle(),
    };
}

/**
 * Convert a single attribute value to a JSON-safe value.
 * @param {*} value - single attribute value
 * @param {number} valueTypeCode - ObjectAttributeDefinition value type code
 * @returns {*} JSON-safe value
 */
function serializeSingle(value, valueTypeCode) {
    if (value === null || value === undefined) {
        return null;
    }
    switch (valueTypeCode) {
        case ObjectAttributeDefinition.VALUE_TYPE_ENUM_OF_INT:
        case ObjectAttributeDefinition.VALUE_TYPE_ENUM_OF_STRING:
            return value.getValue();
        case ObjectAttributeDefinition.VALUE_TYPE_HTML:
            return { source: value.getSource(), markup: value.getMarkup() };
        case ObjectAttributeDefinition.VALUE_TYPE_IMAGE:
            return serializeImage(value);
        case ObjectAttributeDefinition.VALUE_TYPE_DATE:
        case ObjectAttributeDefinition.VALUE_TYPE_DATETIME:
            return value.toISOString();
        default:
            return value;
    }
}

/**
 * Convert an attribute value to a JSON-safe value, mapping each element of multi-value attributes.
 * @param {*} value - attribute value
 * @param {dw.object.ObjectAttributeDefinition} definition - attribute definition
 * @returns {*} JSON-safe value
 */
function serialize(value, definition) {
    var valueTypeCode = definition.getValueTypeCode();
    if (!definition.isMultiValueType()) {
        return serializeSingle(value, valueTypeCode);
    }
    // Multi-value attributes are Java arrays, which are array-like but lack Array.prototype methods.
    return Array.prototype.map.call(value, function (item) {
        return serializeSingle(item, valueTypeCode);
    });
}

/**
 * Read every exposable custom attribute in the exposed group of a preferences object type.
 * @param {string} objectTypeId - SitePreferences or OrganizationPreferences
 * @param {function(string): *} readValue - returns the current value, or default, for an attribute ID
 * @returns {Object|null} { data: [{ groupId, id, value }] }, or null when the group is not defined
 */
function collectExposedPreferences(objectTypeId, readValue) {
    var group = SystemObjectMgr.describe(objectTypeId).getAttributeGroup(EXPOSED_GROUP_ID);
    if (!group) {
        return null;
    }
    var data = [];
    var definitions = group.getAttributeDefinitions().iterator();
    while (definitions.hasNext()) {
        var definition = definitions.next();
        var id = definition.getID();
        if (definition.isSystem()) {
            continue;
        }
        if (definition.getValueTypeCode() === ObjectAttributeDefinition.VALUE_TYPE_PASSWORD) {
            Logger.warn('{0}.{1} is in group {2} but is a password and was not exposed', objectTypeId, id, EXPOSED_GROUP_ID);
            continue;
        }
        var value = readValue(id);
        if (value === null || value === undefined) {
            continue;
        }
        data.push({ groupId: EXPOSED_GROUP_ID, id: id, value: serialize(value, definition) });
    }
    return { data: data };
}

/**
 * @param {Object} configResp - Shopper Configurations response document
 * @returns {undefined} Platform treats undefined as success and returns the mutated document
 */
function modifyGETResponse(configResp) {
    if (!configResp) {
        return undefined;
    }
    try {
        var site = Site.getCurrent();
        var sitePreferences = collectExposedPreferences('SitePreferences', function (id) {
            return site.getCustomPreferenceValue(id);
        });
        if (sitePreferences) {
            configResp.c_customSitePreferences = sitePreferences;
        }
    } catch (e) {
        // Never fail the configuration response over a preference error; omit the field instead.
        Logger.error('Exposing custom site preferences failed: {0}', e instanceof Error ? e.message : String(e));
    }
    try {
        var orgCustom = System.getPreferences().getCustom();
        var globalPreferences = collectExposedPreferences('OrganizationPreferences', function (id) {
            return orgCustom[id];
        });
        if (globalPreferences) {
            configResp.c_customGlobalPreferences = globalPreferences;
        }
    } catch (e) {
        Logger.error('Exposing custom global preferences failed: {0}', e instanceof Error ? e.message : String(e));
    }
    return undefined;
}

exports.modifyGETResponse = modifyGETResponse;
exports.modifyGETResponse.public = true;
