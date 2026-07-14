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
import {
    type ComponentProps,
    createContext,
    type ElementType,
    type ReactNode,
    type Ref,
    useContext,
    useMemo,
    useRef,
} from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/spinner';
import { cn } from '@/lib/utils';

type ToggleCardContextValue = {
    editing: boolean;
    disabled: boolean;
};

const ToggleCardContext = createContext<ToggleCardContextValue | undefined>(undefined);

/** Omit HTML `title` so checkout step headings can be React nodes (e.g. styled spans). */
export type ToggleCardProps = Omit<ComponentProps<'div'>, 'title'> & {
    id?: string;
    title?: ReactNode;
    /** Override the HTML element rendered for the CardTitle. Defaults to "div". */
    titleAs?: ElementType;
    /** Additional className merged into the CardTitle element alongside its default classes. */
    titleClassName?: string;
    description?: ReactNode;
    editing?: boolean;
    disabled?: boolean;
    disableEdit?: boolean;
    onEdit?: () => void;
    editLabel?: ReactNode;
    editVariant?: 'link' | 'outline';
    editAction?: string;
    editActionClassName?: string;
    onEditActionClick?: () => void;
    isLoading?: boolean;
    showHeaderSeparator?: boolean;
    children?: ReactNode;
};

export function ToggleCard({
    id,
    title,
    titleAs,
    titleClassName,
    description,
    editing = false,
    disabled = false,
    disableEdit = false,
    onEdit,
    editLabel,
    editVariant = 'link',
    editAction,
    editActionClassName,
    isLoading = false,
    onEditActionClick,
    showHeaderSeparator = false,
    children,
    className,
    ...props
}: ToggleCardProps) {
    const titleRef = useRef<HTMLDivElement | null>(null);

    const contextValue = useMemo<ToggleCardContextValue>(() => ({ editing, disabled }), [editing, disabled]);

    const showHeaderContentGap = editing || (!editing && !disabled);

    return (
        <ToggleCardContext.Provider value={contextValue}>
            <Card
                className={cn('relative py-4 ', showHeaderContentGap ? 'gap-4' : 'gap-0', className)}
                data-testid={id ? `sf-toggle-card-${id}` : undefined}
                aria-disabled={disabled && !editing ? true : undefined}
                {...props}>
                <CardHeader
                    className={cn(
                        !description && 'grid-rows-1 items-center',
                        showHeaderSeparator && 'border-b border-border pb-4'
                    )}>
                    <CardTitle
                        ref={titleRef as unknown as Ref<HTMLDivElement>}
                        as={titleAs}
                        tabIndex={-1}
                        className={cn(
                            'text-base font-semibold',
                            disabled && !editing ? 'text-muted-foreground' : 'text-foreground',
                            titleClassName
                        )}>
                        {title}
                    </CardTitle>
                    {description ? (
                        <CardDescription className="text-muted-foreground">{description}</CardDescription>
                    ) : null}
                    {/* Actions */}
                    <CardAction className={cn(!description && 'row-span-1 self-center')}>
                        {!editing && !disabled && onEdit && !disableEdit ? (
                            <Button
                                type="button"
                                variant={editVariant}
                                size="sm"
                                className={cn(
                                    editVariant === 'outline' &&
                                        ' bg-card border-border text-foreground hover:bg-muted/50 px-4 py-2 text-sm font-medium',
                                    editVariant === 'link' && 'font-bold'
                                )}
                                onClick={() => {
                                    if (onEdit) {
                                        onEdit();
                                    }
                                }}
                                aria-label={typeof editLabel === 'string' ? editLabel : 'Edit'}>
                                {editLabel ?? 'Edit'}
                            </Button>
                        ) : null}

                        {editing && editAction && onEditActionClick ? (
                            <Button
                                type="button"
                                className={cn(
                                    'cursor-pointer',
                                    !editActionClassName && editVariant === 'link' && 'font-bold',
                                    editActionClassName
                                )}
                                variant={editVariant}
                                size="sm"
                                onClick={onEditActionClick}
                                aria-label={editAction}>
                                {editAction}
                            </Button>
                        ) : null}
                    </CardAction>
                </CardHeader>

                <CardContent data-testid={id ? `sf-toggle-card-${id}-content` : undefined}>{children}</CardContent>

                {isLoading ? (
                    <div className="absolute inset-0 z-10 bg-background/60">
                        <div className="flex h-full w-full items-center justify-center">
                            <Spinner size="md" />
                        </div>
                    </div>
                ) : null}
            </Card>
        </ToggleCardContext.Provider>
    );
}

export function ToggleCardEdit({ children }: { children?: ReactNode }) {
    const ctx = useContext(ToggleCardContext);
    if (!ctx) return null;
    return ctx.editing ? <>{children}</> : null;
}

export function ToggleCardSummary({ children }: { children?: ReactNode }) {
    const ctx = useContext(ToggleCardContext);
    if (!ctx) return null;
    // Show summary when not editing (regardless of disabled state for single page layout)
    return !ctx.editing ? <>{children}</> : null;
}
