export interface paths {
    "/orders/{orderNo}/returns": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create a return or exchange request for an order. */
        post: operations["createReturn"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/orders/{orderNo}/returns/{rmaNo}/advance": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Move a return one status forward (presenter control). */
        post: operations["advanceReturn"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** @enum {string} */
        ReturnAction: "return" | "exchange";
        /** @enum {string} */
        ReturnStatus: "submitted" | "approved" | "received" | "refunded" | "exchange_shipped";
        /** @enum {string} */
        ReturnReason: "too-small" | "too-large" | "defective" | "not-as-described" | "changed-mind" | "wrong-item";
        CreateReturnItem: {
            /** @description Order line item id. */
            itemId: string;
            quantity: number;
            action: components["schemas"]["ReturnAction"];
            reason: components["schemas"]["ReturnReason"];
            /** @description Required for an exchange. A different, orderable variant of the same product. */
            replacementSku?: string;
        };
        CreateReturnRequest: {
            /** @description Idempotency key. A repeated request with the same key returns the first return instead of a second. */
            clientRequestId?: string;
            items: components["schemas"]["CreateReturnItem"][];
        };
        AdvanceReturnRequest: {
            expectedStatus?: components["schemas"]["ReturnStatus"];
        };
        ReturnHistoryEntry: {
            status: components["schemas"]["ReturnStatus"];
            /** Format: date-time */
            at: string;
        };
        ReturnRecord: {
            rmaNo: string;
            status: components["schemas"]["ReturnStatus"];
            clientRequestId?: string;
            items: components["schemas"]["CreateReturnItem"][];
            history: components["schemas"]["ReturnHistoryEntry"][];
            trackingNo?: string | null;
        };
        Problem: {
            type?: string;
            title?: string;
            detail?: string;
        };
    };
    responses: {
        /** @description Problem details */
        Problem: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
    };
    parameters: {
        orderNo: string;
        siteId: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    createReturn: {
        parameters: {
            query: {
                siteId: components["parameters"]["siteId"];
            };
            header?: never;
            path: {
                orderNo: components["parameters"]["orderNo"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateReturnRequest"];
            };
        };
        responses: {
            /** @description The return was created, or an earlier request with the same clientRequestId was returned. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReturnRecord"];
                };
            };
            400: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
        };
    };
    advanceReturn: {
        parameters: {
            query: {
                siteId: components["parameters"]["siteId"];
            };
            header?: never;
            path: {
                orderNo: components["parameters"]["orderNo"];
                rmaNo: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AdvanceReturnRequest"];
            };
        };
        responses: {
            /** @description The updated return. Unchanged when expectedStatus no longer matches or the return is already final. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReturnRecord"];
                };
            };
            400: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
        };
    };
}
