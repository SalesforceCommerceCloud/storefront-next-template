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

export type JsonObject = Record<string, unknown>;

export const asObject = (value: unknown): JsonObject | undefined =>
    value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : undefined;
export const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
export const asNumber = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;
export const asText = (value: unknown): string | undefined =>
    typeof value === 'string' && value.length ? value : undefined;

export function formatMs(value: number | undefined): string {
    if (value === undefined) return '—';
    return value >= 1000 ? `${(value / 1000).toFixed(value % 1000 ? 1 : 0)}s` : `${Math.round(value)}ms`;
}

export function formatBytes(value: number | undefined): string {
    if (value === undefined) return '—';
    if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.round(value / 1024)} KB`;
}

export function formatDate(value: string): string {
    return value.replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}

export const slug = (value: string): string => value.toLowerCase().replace(/[^a-z0-9-]/g, '-');
