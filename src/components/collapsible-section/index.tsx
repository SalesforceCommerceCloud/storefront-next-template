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

import { type ReactElement, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/spinner';
import { CollapsibleLoadingContext } from './collapsible-loading-context';

export interface CollapsibleSectionProps {
    /** The label rendered inside the summary row. Optional when `summary` is provided. */
    label?: string;
    /** Optional content rendered after the label (e.g. AI badge) */
    labelSupplement?: ReactNode;
    /**
     * Optional arbitrary JSX for the summary row, REPLACING the default `label`/`labelSupplement`
     * span (the chevron/spinner still render on the right). Use this when the collapsed header needs
     * richer content than a string — e.g. a selected-value thumbnail + title.
     */
    summary?: ReactNode;
    /** Content revealed when the section is open */
    children: ReactNode;
    /** Whether the section starts open. Defaults to false. */
    defaultOpen?: boolean;
    /**
     * When true, move focus to the section's `<summary>` on mount. Used when the section is remounted
     * collapsed after an in-place selection (e.g. a collapsible swatch section) so keyboard/AT focus
     * isn't dropped to `<body>` when the just-interacted control leaves the DOM. Default false.
     */
    focusSummaryOnMount?: boolean;
    /** Additional classes forwarded to the outer <details> element */
    className?: string;
}

/**
 * A native HTML `<details>`/`<summary>` collapsible section.
 *
 * Children are lazy-mounted: they are not rendered until the section is opened
 * for the first time (or immediately if `defaultOpen` is true). Once mounted,
 * children remain in the DOM so their state (e.g. fetched data) is preserved
 * across subsequent open/close cycles.
 *
 * The `open` attribute is React-controlled. Clicking the summary mounts children
 * and sets a pending flag but does NOT expand the section immediately. The section
 * only opens once `isLoading` is false, preventing any layout shift from async
 * children (e.g. ProductAdapterSection). For synchronous children the section
 * opens on the same tick since `isLoading` is never set.
 *
 * While a child signals loading via `CollapsibleLoadingContext`, the chevron
 * icon is replaced with a spinner.
 */
export default function CollapsibleSection({
    label,
    labelSupplement,
    summary,
    children,
    defaultOpen = false,
    focusSummaryOnMount = false,
    className,
}: CollapsibleSectionProps): ReactElement {
    // Whether the section is visually open (controls the open attribute).
    const [isOpen, setIsOpen] = useState(defaultOpen);
    // Whether children have been mounted at least once (for lazy mounting).
    const [hasOpened, setHasOpened] = useState(defaultOpen);
    // Set to true when the user clicks to open while content is still loading.
    const [pendingOpen, setPendingOpen] = useState(false);
    // Rendered loading state — drives the spinner visibility.
    const [isLoading, setIsLoadingState] = useState(false);
    // Ref mirror of isLoading. Written synchronously inside setLoading so the
    // open-decision effect (below) can read the true current value without
    // waiting for a child's queued state update to commit. This works because
    // React flushes children's effects before parents', so by the time the
    // parent effect reads the ref, the child has already written to it.
    const isLoadingRef = useRef(false);
    // Summary node, used to restore focus on mount when `focusSummaryOnMount` is set.
    const summaryRef = useRef<HTMLElement>(null);

    const loadingContextValue = useMemo(
        () => ({
            setLoading: (loading: boolean) => {
                isLoadingRef.current = loading;
                setIsLoadingState(loading);
            },
        }),
        [] // setIsLoadingState is a stable state setter — no deps needed
    );

    // Open the section once both conditions hold: the user requested it
    // (pendingOpen) and no child is loading. Reading the ref rather than the
    // isLoading state ensures we see the child's synchronous write even before
    // its queued state update has re-rendered. isLoading is still listed in
    // deps so this effect re-runs when loading state changes.
    useEffect(() => {
        if (pendingOpen && !isLoadingRef.current) {
            setIsOpen(true);
            setPendingOpen(false);
        }
    }, [pendingOpen, isLoading]); // isLoading re-triggers this effect when the child finishes loading

    // On mount, optionally take focus to the summary. Used when a parent remounts this section
    // (via a changed key) after an in-place selection, so focus isn't orphaned on <body>.
    useEffect(() => {
        if (focusSummaryOnMount) {
            summaryRef.current?.focus();
        }
        // Mount-only: the parent controls this via a fresh key, so we intentionally don't re-run.
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSummaryClick = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        if (isOpen) {
            setIsOpen(false);
        } else {
            setHasOpened(true);
            setPendingOpen(true);
        }
    };

    return (
        <CollapsibleLoadingContext value={loadingContextValue}>
            <details className={cn('group border-b border-border', className)} open={isOpen || undefined}>
                <summary
                    ref={summaryRef}
                    className="flex items-center justify-between gap-4 py-4 text-base font-medium text-foreground cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground transition-colors"
                    onClick={handleSummaryClick}>
                    {summary ?? (
                        <span className="flex items-center gap-2">
                            {label}
                            {labelSupplement}
                        </span>
                    )}
                    {isLoading || pendingOpen ? (
                        <Spinner size="sm" />
                    ) : (
                        <ChevronDownIcon
                            aria-hidden="true"
                            className="text-muted-foreground pointer-events-none size-5 shrink-0 translate-y-0.5 transition-transform duration-200 group-open:rotate-180"
                        />
                    )}
                </summary>
                <div className="pb-4">{hasOpened && children}</div>
            </details>
        </CollapsibleLoadingContext>
    );
}
