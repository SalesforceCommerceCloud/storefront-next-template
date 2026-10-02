'use strict';

/**
 * Returns custom API (v1). Stores returns and exchanges on the order as the Text attribute c_returns.
 *
 * Both endpoints:
 *  - act only on an order that belongs to the logged-in shopper (anything else answers 404, so order numbers cannot be
 *    probed), and
 *  - re-run the return rules on the server with the same logic the storefront uses (scripts/returns/returns-core.js).
 *
 * The pure rules live in returns-core.js. This file only reads SFCC objects, calls the core and writes the result.
 */

var RESTResponseMgr = require('dw/system/RESTResponseMgr');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');
var OrderMgr = require('dw/order/OrderMgr');
var core = require('*/cartridge/scripts/returns/returns-core');
// JSON files are required without the extension in SFCC (like SFRA's config/countries).
var policy = require('*/cartridge/scripts/returns/return-policy');

// Custom attributes are addressed without the c_ prefix in server scripts (order.custom.returns). SCAPI adds c_ in JSON.
var RETURNS_ATTRIBUTE = 'returns';
var DELIVERY_SPLIT_ATTRIBUTE = 'deliverySplit';

/** The response to send once the transaction (if any) has committed. */
function problem(status, title, detail) {
    return { error: { status: status, title: title, detail: detail } };
}

function success(body, status) {
    return { success: { body: body, status: status } };
}

/** Sends the outcome. Called after Transaction.wrap returns, so a failed commit can never follow a sent success. */
function render(outcome) {
    if (outcome.error) {
        RESTResponseMgr.createError(
            outcome.error.status,
            'https://api.dressup.example/problems/returns',
            outcome.error.title,
            outcome.error.detail
        ).render();
        return;
    }
    if (outcome.success.status) {
        RESTResponseMgr.createSuccess(outcome.success.body, outcome.success.status).render();
    } else {
        RESTResponseMgr.createSuccess(outcome.success.body).render();
    }
}

function readBody() {
    try {
        return JSON.parse(request.httpParameterMap.requestBodyAsString);
    } catch (e) {
        return null;
    }
}

/** The order if it exists and belongs to the logged-in registered shopper, otherwise null. */
function getOwnedOrder(orderNo) {
    var customer = request.session.customer;
    if (!customer || !customer.authenticated || !customer.profile) return null;
    var order = OrderMgr.getOrder(orderNo);
    if (!order || order.customerNo !== customer.profile.customerNo) return null;
    return order;
}

function readSplitDates(order) {
    var dates = {};
    try {
        var split = JSON.parse(order.custom[DELIVERY_SPLIT_ATTRIBUTE]);
        if (!split || split.version !== 1) return dates;
        split.deliveries.forEach(function (delivery) {
            delivery.items.forEach(function (item) {
                dates[item.itemId] = delivery.deliveryDate;
            });
        });
    } catch (e) {
        // No saved split (older order): every line falls back to the order creation date.
    }
    return dates;
}

/** The order lines as the core rules expect them. */
function buildLines(order) {
    var splitDates = readSplitDates(order);
    var orderDate = order.creationDate ? order.creationDate.toISOString() : null;
    var lines = [];
    var iterator = order.getProductLineItems().iterator();
    while (iterator.hasNext()) {
        var item = iterator.next();
        if (item.bonusProductLineItem || !item.productID) continue;

        var product = item.product;
        var master = product && product.variant ? product.masterProduct : product;
        var variants = [];
        if (master && master.master) {
            var variantIterator = master.variants.iterator();
            while (variantIterator.hasNext()) {
                var variant = variantIterator.next();
                variants.push({ sku: variant.ID, orderable: variant.onlineFlag && variant.availabilityModel.orderable });
            }
        }
        lines.push({
            lineKey: item.UUID,
            sku: item.productID,
            quantity: item.quantityValue,
            categoryId: master && master.primaryCategory ? master.primaryCategory.ID : null,
            deliveredAt: splitDates[item.UUID] || orderDate,
            variants: variants
        });
    }
    return lines;
}

function problemFor(validation) {
    var messages = {
        empty: 'The request has no items.',
        'unknown-line': 'An item is not on this order or appears twice.',
        'invalid-quantity': 'A quantity is not a whole number of at least 1.',
        'quantity-exceeded': 'A quantity is more than can still be returned.',
        'action-not-allowed': 'The return rules do not allow that action for this item.',
        'missing-reason': 'A reason is missing or not on the list.',
        'invalid-replacement': 'The replacement must be a different, orderable variant of the same product.'
    };
    return problem(validation.error === 'quantity-exceeded' ? 409 : 400, validation.error, messages[validation.error]);
}

function createReturnHandler() {
    var orderNo = request.getSCAPIPathParameters().get('orderNo');
    var order = getOwnedOrder(orderNo);
    if (!order) return render(problem(404, 'order-not-found', 'No such order.'));

    var body = readBody();
    if (!body || !Array.isArray(body.items)) {
        return render(problem(400, 'invalid-body', 'The body must contain an items array.'));
    }

    var outcome = null;
    Transaction.wrap(function () {
        // Read inside the transaction, right before writing, so a request that raced us is seen.
        var returns = core.parseStoredReturns(order.custom[RETURNS_ATTRIBUTE]);

        if (body.clientRequestId) {
            for (var i = 0; i < returns.length; i++) {
                if (returns[i].clientRequestId === body.clientRequestId) {
                    outcome = success(returns[i], 201);
                    return;
                }
            }
        }

        var validation = core.validateSelection(
            body.items,
            buildLines(order),
            core.getRequestedQuantities(returns),
            new Date().getTime(),
            policy
        );
        if (!validation.ok) {
            outcome = problemFor(validation);
            return;
        }

        var rmaNo = core.generateRmaNo(
            returns.map(function (stored) { return stored.rmaNo; }),
            Math.random,
            new Date().getTime()
        );
        var record = core.buildReturnRecord(body.items, rmaNo, body.clientRequestId, new Date().toISOString());
        returns.push(record);
        order.custom[RETURNS_ATTRIBUTE] = core.serializeReturns(returns);
        outcome = success(record, 201);
    });
    render(outcome);
}

function advanceReturnHandler() {
    var params = request.getSCAPIPathParameters();
    var order = getOwnedOrder(params.get('orderNo'));
    if (!order) return render(problem(404, 'order-not-found', 'No such order.'));

    var body = readBody() || {};
    var outcome = null;
    Transaction.wrap(function () {
        var returns = core.parseStoredReturns(order.custom[RETURNS_ATTRIBUTE]);
        var index = -1;
        for (var i = 0; i < returns.length; i++) {
            if (returns[i].rmaNo === params.get('rmaNo')) index = i;
        }
        if (index === -1) {
            outcome = problem(404, 'return-not-found', 'No such return on this order.');
            return;
        }
        var updated = core.advanceRecord(returns[index], body.expectedStatus, new Date().toISOString());
        if (updated !== returns[index]) {
            returns[index] = updated;
            order.custom[RETURNS_ATTRIBUTE] = core.serializeReturns(returns);
        }
        outcome = success(updated);
    });
    render(outcome);
}

/**
 * Runs a handler and turns an unexpected error into a logged, generic 500, so the cause is in the log
 * (category "returns") instead of only an anonymous Internal Server Error.
 */
function guarded(name, handler) {
    var wrapped = function () {
        try {
            return handler();
        } catch (e) {
            Logger.getLogger('returns', 'returns').error('{0} failed: {1}\n{2}', name, String(e), e && e.stack ? e.stack : '');
            return render(problem(500, 'server-error', 'The returns service hit an unexpected error.'));
        }
    };
    // Like a controller action, an exported function must be marked public or SFCC refuses it for web requests
    // ("Method ... is not allowed for web requests").
    wrapped.public = true;
    return wrapped;
}

exports.createReturn = guarded('createReturn', createReturnHandler);
exports.advanceReturn = guarded('advanceReturn', advanceReturnHandler);
