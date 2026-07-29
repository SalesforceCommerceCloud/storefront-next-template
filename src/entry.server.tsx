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
 * Custom server entry that forwards the per-request CSP nonce to React
 * Router's <ServerRouter>. RR's default entry.server doesn't pass a
 * nonce, so the inline scripts emitted by <Scripts /> and StreamTransfer
 * (deferred-data hydration chunks) are blocked by the strict CSP shipped
 * by createSecurityHeadersMiddleware.
 *
 * Mirrors the @react-router/dev default at
 *   node_modules/@react-router/dev/dist/config/defaults/entry.server.node.tsx
 * but reads the nonce from securityContext (set by the security middleware
 * before next() runs) and passes it to <ServerRouter nonce={...}>.
 */
import { PassThrough } from 'node:stream';
import { createReadableStreamFromReadable } from '@react-router/node';
import { ServerRouter, type EntryContext, type RouterContextProvider } from 'react-router';
import { isbot } from 'isbot';
import { renderToPipeableStream, type RenderToPipeableStreamOptions } from 'react-dom/server';
import { securityContext } from '@salesforce/storefront-next-runtime/security';
import { NonceContext } from '@salesforce/storefront-next-runtime/security/react';

export const streamTimeout = 5_000;

export default function handleRequest(
    request: Request,
    responseStatusCode: number,
    responseHeaders: Headers,
    routerContext: EntryContext,
    loadContext: RouterContextProvider
): Promise<Response> {
    if (request.method.toUpperCase() === 'HEAD') {
        return Promise.resolve(
            new Response(null, {
                status: responseStatusCode,
                headers: responseHeaders,
            })
        );
    }

    const nonce = loadContext.get(securityContext)?.nonce;

    return new Promise((resolve, reject) => {
        let shellRendered = false;
        const userAgent = request.headers.get('user-agent');

        const readyOption: keyof RenderToPipeableStreamOptions =
            (userAgent && isbot(userAgent)) || routerContext.isSpaMode ? 'onAllReady' : 'onShellReady';

        let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(() => abort(), streamTimeout + 1000);

        const { pipe, abort } = renderToPipeableStream(
            // NonceContext makes the nonce available to React components even
            // when the root loader throws (where useRouteLoaderData('root')
            // returns undefined). Layout reads it as a fallback so error pages
            // still get nonced inline scripts.
            <NonceContext.Provider value={nonce}>
                <ServerRouter context={routerContext} url={request.url} nonce={nonce} />
            </NonceContext.Provider>,
            {
                nonce,
                [readyOption]() {
                    shellRendered = true;
                    const body = new PassThrough({
                        final(callback) {
                            clearTimeout(timeoutId);
                            timeoutId = undefined;
                            callback();
                        },
                    });
                    const stream = createReadableStreamFromReadable(body);

                    responseHeaders.set('Content-Type', 'text/html');

                    pipe(body);

                    resolve(
                        new Response(stream, {
                            headers: responseHeaders,
                            status: responseStatusCode,
                        })
                    );
                },
                onShellError(error: unknown) {
                    reject(error);
                },
                onError(error: unknown) {
                    responseStatusCode = 500;
                    if (shellRendered) {
                        // oxlint-disable-next-line no-console
                        console.error(error);
                    }
                },
            }
        );
    });
}
