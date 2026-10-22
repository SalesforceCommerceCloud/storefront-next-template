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
 * Whether OpenTelemetry tracing is enabled for this process.
 *
 * Tracing is on when either flag is the string `"true"`; otherwise no spans, propagator, or
 * instrumentation are installed.
 *
 * @env SFNEXT_OTEL_ENABLED — optional; `"true"` enables tracing (e.g. `SFNEXT_OTEL_ENABLED=true pnpm dev`)
 * @env MRT_DISTRIBUTED_TRACING_ENABLED — optional; `"true"` enables tracing (e.g. set by Managed Runtime)
 */
export function isOtelEnabled(): boolean {
    return process.env.SFNEXT_OTEL_ENABLED === 'true' || process.env.MRT_DISTRIBUTED_TRACING_ENABLED === 'true';
}
