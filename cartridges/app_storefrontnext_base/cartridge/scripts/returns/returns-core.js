'use strict';

/**
 * Pure return rules for the Returns custom API. No `dw/*` imports, so the logic can be unit-tested outside SFCC and
 * is checked against the storefront's TypeScript rules (src/lib/returns/eligibility.ts) by a parity test.
 * Keep it ES5 style: the SFCC script engine does not support every modern JavaScript feature.
 *
 * Every function takes the policy and the current time as arguments; nothing here reads a clock or a global.
 */

var DAY_MS = 24 * 60 * 60 * 1000;
var DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
var STEPS_BEFORE_FINAL = ['submitted', 'approved', 'received'];
var REASONS = ['too-small', 'too-large', 'defective', 'not-as-described', 'changed-mind', 'wrong-item'];
var ACTIONS = ['return', 'exchange'];
var RETURNS_VERSION = 1;

function contains(list, value) {
    return list.indexOf(value) !== -1;
}

/** Last instant a return is accepted, as epoch milliseconds, or null when the date is missing or invalid. */
function getWindowEnd(deliveredAt, policy) {
    if (!deliveredAt) return null;
    var start;
    if (DATE_ONLY.test(deliveredAt)) {
        start = Date.parse(deliveredAt + 'T00:00:00Z');
        return isNaN(start) ? null : start + (policy.defaultWindowDays + 1) * DAY_MS - 1;
    }
    start = new Date(deliveredAt).getTime();
    return isNaN(start) ? null : start + policy.defaultWindowDays * DAY_MS;
}

/**
 * Same precedence as the storefront: SKU rules, then category, then the default window.
 * Returns { status, allowedActions }.
 */
function getItemEligibility(line, nowMs, policy) {
    if (contains(policy.nonReturnableSkus, line.sku)) return { status: 'not-returnable', allowedActions: [] };
    if (contains(policy.exchangeOnlySkus, line.sku)) return { status: 'exchange-only', allowedActions: ['exchange'] };
    if (line.categoryId && contains(policy.nonReturnableCategories, line.categoryId)) {
        return { status: 'not-returnable', allowedActions: [] };
    }
    var end = getWindowEnd(line.deliveredAt, policy);
    if (end === null || nowMs > end) return { status: 'window-closed', allowedActions: [] };
    return { status: 'eligible', allowedActions: ['return', 'exchange'] };
}

/**
 * Validates a selection. `lines` are { lineKey, sku, quantity, categoryId, deliveredAt, variants: [{ sku, orderable }] },
 * `alreadyRequested` maps lineKey to the quantity already in earlier requests.
 * Returns { ok: true } or { ok: false, error, lineKey }.
 */
function validateSelection(items, lines, alreadyRequested, nowMs, policy) {
    if (!items || items.length === 0) return { ok: false, error: 'empty' };

    var byKey = {};
    var i;
    for (i = 0; i < lines.length; i++) byKey[lines[i].lineKey] = lines[i];
    var seen = {};

    for (i = 0; i < items.length; i++) {
        var item = items[i];
        var line = Object.prototype.hasOwnProperty.call(byKey, item.itemId) ? byKey[item.itemId] : null;
        if (!line || seen[item.itemId]) return { ok: false, error: 'unknown-line', lineKey: item.itemId };
        seen[item.itemId] = true;

        var remaining = line.quantity - (alreadyRequested[line.lineKey] || 0);
        if (typeof item.quantity !== 'number' || item.quantity % 1 !== 0 || item.quantity < 1) {
            return { ok: false, error: 'invalid-quantity', lineKey: line.lineKey };
        }
        if (item.quantity > remaining) return { ok: false, error: 'quantity-exceeded', lineKey: line.lineKey };

        if (!contains(ACTIONS, item.action) || !contains(getItemEligibility(line, nowMs, policy).allowedActions, item.action)) {
            return { ok: false, error: 'action-not-allowed', lineKey: line.lineKey };
        }
        if (!contains(REASONS, item.reason)) return { ok: false, error: 'missing-reason', lineKey: line.lineKey };

        if (item.action === 'exchange') {
            var replacement = null;
            for (var v = 0; v < line.variants.length; v++) {
                if (line.variants[v].sku === item.replacementSku) replacement = line.variants[v];
            }
            if (!replacement || !replacement.orderable || replacement.sku === line.sku) {
                return { ok: false, error: 'invalid-replacement', lineKey: line.lineKey };
            }
        }
    }
    return { ok: true };
}

/** Quantity of each line already covered by stored returns. */
function getRequestedQuantities(returns) {
    var requested = {};
    for (var r = 0; r < returns.length; r++) {
        for (var i = 0; i < returns[r].items.length; i++) {
            var item = returns[r].items[i];
            requested[item.itemId] = (requested[item.itemId] || 0) + item.quantity;
        }
    }
    return requested;
}

function getFinalStatus(items) {
    for (var i = 0; i < items.length; i++) if (items[i].action === 'exchange') return 'exchange_shipped';
    return 'refunded';
}

function getStatusSteps(items) {
    return STEPS_BEFORE_FINAL.concat([getFinalStatus(items)]);
}

/** Derived from the RMA number, so advancing twice can never give two different tracking numbers. */
function getMockTrackingNo(rmaNo) {
    var hash = 0;
    for (var i = 0; i < rmaNo.length; i++) hash = (hash * 31 + rmaNo.charCodeAt(i)) >>> 0;
    var digits = String(hash);
    while (digits.length < 10) digits = '0' + digits;
    return '1Z' + digits.slice(-10) + 'DEMO';
}

/** Ten attempts is far more than a demo order can collide on; then a time-based suffix guarantees uniqueness. */
function generateRmaNo(existingRmaNos, random, nowMs) {
    for (var attempt = 0; attempt < 10; attempt++) {
        var digits = '';
        for (var d = 0; d < 6; d++) digits += String(Math.floor(random() * 10));
        var candidate = 'RMA-' + digits;
        if (!contains(existingRmaNos, candidate)) return candidate;
    }
    return 'RMA-' + nowMs;
}

/** Reads the c_returns text attribute. Anything unreadable or of another version is an empty list. */
function parseStoredReturns(raw) {
    if (!raw) return [];
    try {
        var parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== RETURNS_VERSION || !Array.isArray(parsed.returns)) return [];
        return parsed.returns;
    } catch (e) {
        return [];
    }
}

function serializeReturns(returns) {
    return JSON.stringify({ version: RETURNS_VERSION, returns: returns });
}

/** Builds the stored record for a new return. */
function buildReturnRecord(items, rmaNo, clientRequestId, nowIso) {
    var record = {
        rmaNo: rmaNo,
        status: 'submitted',
        items: items.map(function (item) {
            var stored = { itemId: item.itemId, quantity: item.quantity, action: item.action, reason: item.reason };
            if (item.action === 'exchange') stored.replacementSku = item.replacementSku;
            return stored;
        }),
        history: [{ status: 'submitted', at: nowIso }],
        trackingNo: null
    };
    if (clientRequestId) record.clientRequestId = clientRequestId;
    return record;
}

/**
 * Moves a record one step forward. When expectedStatus is given and differs from the stored status (a double click,
 * or another device already advanced it), or the record is already final, the record is returned unchanged.
 */
function advanceRecord(record, expectedStatus, nowIso) {
    if (expectedStatus && record.status !== expectedStatus) return record;
    var steps = getStatusSteps(record.items);
    var next = steps[steps.indexOf(record.status) + 1];
    if (!next) return record;

    var history = record.history.concat([{ status: next, at: nowIso }]);
    var updated = {};
    for (var key in record) if (Object.prototype.hasOwnProperty.call(record, key)) updated[key] = record[key];
    updated.status = next;
    updated.history = history;
    if (next === 'exchange_shipped') updated.trackingNo = getMockTrackingNo(record.rmaNo);
    return updated;
}

module.exports = {
    getWindowEnd: getWindowEnd,
    getItemEligibility: getItemEligibility,
    validateSelection: validateSelection,
    getRequestedQuantities: getRequestedQuantities,
    getFinalStatus: getFinalStatus,
    getStatusSteps: getStatusSteps,
    getMockTrackingNo: getMockTrackingNo,
    generateRmaNo: generateRmaNo,
    parseStoredReturns: parseStoredReturns,
    serializeReturns: serializeReturns,
    buildReturnRecord: buildReturnRecord,
    advanceRecord: advanceRecord,
    REASONS: REASONS,
    RETURNS_VERSION: RETURNS_VERSION
};
