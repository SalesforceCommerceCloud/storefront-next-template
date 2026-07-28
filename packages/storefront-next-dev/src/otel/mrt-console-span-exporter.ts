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

export class MrtConsoleSpanExporter extends ConsoleSpanExporter {
    export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
        for (const span of spans) {
            try {
                const ctx = span.spanContext();
                const spanData = {
                    traceId: ctx.traceId,
                    parentId: span.parentSpanId,
                    name: span.name,
                    id: ctx.spanId,
                    kind: span.kind,
                    timestamp: hrTimeToTimeStamp(span.startTime),
                    duration: span.duration,
                    attributes: span.attributes,
                    status: span.status,
                    events: span.events,
                    links: span.links,
                    start_time: span.startTime,
                    end_time: span.endTime,
                    forwardTrace: process.env.SFNEXT_OTEL_ENABLED === 'true',
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
