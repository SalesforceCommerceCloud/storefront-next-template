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
export const MERCHANDISING_GRID_COLUMNS = [2, 3, 4] as const;

export type MerchandisingGridColumns = (typeof MERCHANDISING_GRID_COLUMNS)[number];

const DEFAULT_COLUMNS: MerchandisingGridColumns = 4;
const DEFAULT_ROWS = 2;
const MAX_ROWS = 6;
const MAX_PRODUCTS = 24;

export const merchandisingGridClasses: Record<MerchandisingGridColumns, string> = {
    2: 'grid-cols-2',
    3: 'grid-cols-2 md:grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
};

export const merchandisingGridImageWidths: Record<MerchandisingGridColumns, string[]> = {
    2: ['48vw', '48vw', '48vw', '48vw', '48vw', '48vw'],
    3: ['48vw', '48vw', '32vw', '32vw', '32vw', '32vw'],
    4: ['48vw', '32vw', '32vw', '24vw', '24vw', '24vw'],
};

function isMerchandisingGridColumns(value: number): value is MerchandisingGridColumns {
    return MERCHANDISING_GRID_COLUMNS.includes(value as MerchandisingGridColumns);
}

function toInteger(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isInteger(value)) {
        return value;
    }

    if (typeof value === 'string' && /^\d+$/.test(value)) {
        return Number(value);
    }

    return undefined;
}

/**
 * Normalizes author-configured layout values before either fetching or rendering products.
 * The derived cap keeps product searches bounded and prevents an incomplete grid caused by
 * independently configured row, column, and limit values.
 */
export function resolveMerchandisingGridLayout({
    columns: columnsInput,
    rows: rowsInput,
}: {
    columns?: unknown;
    rows?: unknown;
} = {}) {
    const parsedColumns = toInteger(columnsInput);
    const columns =
        parsedColumns !== undefined && isMerchandisingGridColumns(parsedColumns) ? parsedColumns : DEFAULT_COLUMNS;
    const parsedRows = toInteger(rowsInput);
    const rows = parsedRows === undefined ? DEFAULT_ROWS : Math.min(Math.max(parsedRows, 1), MAX_ROWS);

    return {
        columns,
        rows,
        limit: Math.min(columns * rows, MAX_PRODUCTS),
    };
}
