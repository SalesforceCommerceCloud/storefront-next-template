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
 * MRT-compatible console span exporter.
 *
 * Extends the default ConsoleSpanExporter to output structured JSON that
 * Managed Runtime's log infrastructure can parse. The default exporter uses
 * `console.dir` with a human-readable format; this override uses
 * `console.info(JSON.stringify(...))` to produce machine-parseable JSON
 * matching the format MRT expects.
 *
 * Inherits `shutdown()` and `forceFlush()` from ConsoleSpanExporter.
 */

import { ConsoleSpanExporter, type ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { ExportResultCode, type ExportResult, hrTimeToTimeStamp } from '@opentelemetry/core';
import { isOtelEnabled } from './enabled';

/** URL attributes never export userinfo, query values, or fragments (including OAuth launch/callback material). */
function privateUrlAttributes(attributes: ReadableSpan['attributes']): ReadableSpan['attributes'] {
    const safe = { ...attributes };
    delete safe['url.query'];
    delete safe['url.fragment'];
    for (const key of ['url.full', 'http.url', 'http.target', 'url.path']) {
        if (safe[key] === undefined) continue;
        if (typeof safe[key] !== 'string') {
            delete safe[key];
            continue;
        }
        try {
            const absolute = /^https?:\/\//i.test(safe[key]);
            const url = new URL(safe[key], 'https://redacted.invalid');
            safe[key] = absolute ? `${url.origin}${url.pathname}` : url.pathname;
        } catch {
            delete safe[key];
        }
    }
    return safe;
}

/** Free-text fields (span names, error messages, stack traces) can embed full request URLs, so strip the same parts there. */
function privateText(text: string): string {
    return text.replace(/\/\/[^/\s@]+@/g, '//').replace(/(?<=\S)[?#][^\s"'`)\]]*/g, '');
}

function privateEventAttributes(attributes: ReadableSpan['attributes']): ReadableSpan['attributes'] {
    const safe = privateUrlAttributes(attributes);
    for (const key of ['exception.message', 'exception.stacktrace']) {
        const value = safe[key];
        if (typeof value === 'string') safe[key] = privateText(value);
    }
    return safe;
}

export class MrtConsoleSpanExporter extends ConsoleSpanExporter {
    export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
        for (const span of spans) {
            try {
                const ctx = span.spanContext();
                const spanData = {
                    traceId: ctx.traceId,
                    parentId: span.parentSpanId,
                    name: privateText(span.name),
                    id: ctx.spanId,
                    kind: span.kind,
                    timestamp: hrTimeToTimeStamp(span.startTime),
                    duration: span.duration,
                    attributes: privateUrlAttributes(span.attributes),
                    status:
                        span.status.message === undefined
                            ? span.status
                            : { ...span.status, message: privateText(span.status.message) },
                    events: span.events.map((event) => ({
                        ...event,
                        ...(event.attributes && { attributes: privateEventAttributes(event.attributes) }),
                    })),
                    links: span.links.map((link) => ({
                        ...link,
                        ...(link.attributes && { attributes: privateUrlAttributes(link.attributes) }),
                    })),
                    start_time: span.startTime,
                    end_time: span.endTime,
                    forwardTrace: isOtelEnabled(),
                };
                // oxlint-disable-next-line no-console -- intentional: MRT collects stdout as the telemetry transport
                console.info(JSON.stringify(spanData));
            } catch {
                // Skip malformed spans — never let a serialization failure propagate
            }
        }
        resultCallback({ code: ExportResultCode.SUCCESS });
    }
}
