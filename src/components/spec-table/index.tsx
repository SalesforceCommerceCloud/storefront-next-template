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
import { type KeyboardEvent, type ReactElement, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { SpecTableContent, SpecTableRow } from '@/components/html-fragment/types';

export interface SpecTableProps {
    content: SpecTableContent;
    className?: string;
}

/**
 * Renders structured 2-column section content: a fixed label column and a value column.
 *
 * When the content declares two or more `views`, a right-aligned segmented switch flips only the
 * value column between the views (e.g. Imperial ↔ Metric) — the values are pre-resolved per view,
 * so switching does no conversion. With fewer than two views it renders a plain 2-column table,
 * matching the legacy `table-2-column` HTML look. Backward-compatible for any consumer.
 */
export default function SpecTable({ content, className }: SpecTableProps): ReactElement {
    const { rows, groups, views, defaultViewId, viewSwitchLabel } = content;
    const hasSwitch = (views?.length ?? 0) >= 2;
    const initialView = defaultViewId ?? views?.[0]?.id ?? '';
    const [activeView, setActiveView] = useState(initialView);
    const radioGroupRef = useRef<HTMLDivElement>(null);

    // Roving arrow-key navigation for the radiogroup (ARIA APG): Left/Up ⇒ previous, Right/Down ⇒
    // next, wrapping. Selecting a radio also moves focus to it, matching native radio behavior.
    const onRadioKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
        if (!views || views.length < 2) return;
        const current = views.findIndex((v) => v.id === activeView);
        let next = current;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (current + 1) % views.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (current - 1 + views.length) % views.length;
        else return;
        e.preventDefault();
        setActiveView(views[next].id);
        radioGroupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
    };

    const valueFor = (row: SpecTableRow): string => {
        if (activeView && row.values[activeView] !== undefined) return row.values[activeView];
        if (defaultViewId && row.values[defaultViewId] !== undefined) return row.values[defaultViewId];
        return Object.values(row.values)[0] ?? '';
    };

    // A row list rendered as a 2-column definition list. The switch (if any) flips only rows that
    // carry a value for the active view; single-value rows fall back and stay static.
    const renderRows = (rowsToRender: SpecTableRow[]) => (
        <dl className="border-t border-border">
            {rowsToRender.map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-4 border-b border-border py-1.5">
                    <dt className="w-1/2 font-semibold">{row.label}</dt>
                    <dd className="text-right tabular-nums">{valueFor(row)}</dd>
                </div>
            ))}
        </dl>
    );

    return (
        <div className={cn('text-sm text-foreground', className)} data-slot="spec-table">
            {hasSwitch && (
                <div
                    ref={radioGroupRef}
                    role="radiogroup"
                    aria-label={viewSwitchLabel ?? views?.map((v) => v.label).join(', ')}
                    className="mb-2 flex items-center justify-end gap-1">
                    {views?.map((view) => {
                        const checked = activeView === view.id;
                        return (
                            <button
                                key={view.id}
                                type="button"
                                role="radio"
                                aria-checked={checked}
                                // Roving tabindex: only the checked radio is in the tab order; arrow
                                // keys move between the others (handled at the group level).
                                tabIndex={checked ? 0 : -1}
                                onClick={() => setActiveView(view.id)}
                                onKeyDown={onRadioKeyDown}
                                data-slot="spec-table-unit-toggle"
                                className={cn(
                                    'rounded-ui px-2.5 py-1 text-xs font-medium transition-colors',
                                    checked
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted text-muted-foreground hover:bg-muted-hover'
                                )}>
                                {view.label}
                            </button>
                        );
                    })}
                </div>
            )}
            {groups?.length ? (
                <div className="space-y-4">
                    {groups.map((group) => (
                        <div key={group.heading}>
                            <h4 className="mb-1 text-sm font-semibold text-foreground">{group.heading}</h4>
                            {renderRows(group.rows)}
                        </div>
                    ))}
                </div>
            ) : (
                renderRows(rows ?? [])
            )}
        </div>
    );
}
