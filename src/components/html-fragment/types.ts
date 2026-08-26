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

export type HtmlContentType = 'plain-text' | 'bulleted-list' | 'table-2-column';

export interface HtmlContent {
    html: string;
    contentType: HtmlContentType;
}

/** One selectable representation of a spec table's values (e.g. an "Imperial" or "Metric" view). */
export interface SpecTableView {
    /** Stable id used to key each row's value (e.g. 'imperial', 'metric'). */
    id: string;
    /** Localized label shown on the view switch. */
    label: string;
}

/** A single label/value row; `values` holds the value string per view id. */
export interface SpecTableRow {
    label: string;
    /** Value per view id. A row missing a view falls back to the active view's nearest available value. */
    values: Record<string, string>;
}

/** A labeled subsection of a spec table (e.g. "Dimensions", "Materials"). */
export interface SpecTableGroup {
    heading: string;
    rows: SpecTableRow[];
}

/**
 * Structured 2-column section content. The label column is fixed; the value column shows
 * `row.values[activeView]`. When two or more `views` are provided, the renderer shows a
 * switch that flips only the value column — a backward-compatible way to express a value with
 * an alternate representation (e.g. metric ↔ imperial) without any runtime conversion. With
 * fewer than two views it renders as a plain 2-column table.
 */
export interface SpecTableContent {
    contentType: 'spec-table';
    /** Flat rows for a single-section table. Provide this OR `groups`. */
    rows?: SpecTableRow[];
    /** Rows split into labeled subsections. Provide this OR `rows` (takes precedence when set). */
    groups?: SpecTableGroup[];
    views?: SpecTableView[];
    /** View selected on first render (SSR). Defaults to the first view. */
    defaultViewId?: string;
    /** Accessible name for the view switch group (e.g. "Units"). */
    viewSwitchLabel?: string;
}

/** Content a PDP collapsible section can resolve to: legacy HTML, or a structured spec table. */
export type SectionContent = HtmlContent | SpecTableContent;
