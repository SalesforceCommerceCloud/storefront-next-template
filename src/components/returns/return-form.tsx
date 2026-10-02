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

import { useCallback, useMemo, useRef, useState, type FormEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Typography } from '@/components/typography';
import { useNavigate } from '@/hooks/use-navigate';
import { useReturns } from '@/hooks/use-returns';
import { routes, routeHref } from '@/route-paths';
import {
    getItemEligibility,
    getRequestedQuantities,
    groupLinesByDelivery,
    validateSelection,
} from '@/lib/returns/eligibility';
import {
    applyVariationChange,
    findVariant,
    getAvailableValues,
    hasExchangeOptions,
} from '@/lib/returns/exchange-options';
import { createReturn, getReturnsSnapshot } from '@/lib/returns/return-store';
import {
    RETURN_REASONS,
    type ReturnAction,
    type ReturnItem,
    type ReturnReasonId,
    type ReturnableLine,
} from '@/lib/returns/types';
import { ItemStatusBadge } from './item-status-badge';

interface LineDraft {
    quantity: number;
    action: ReturnAction;
    reason: ReturnReasonId | '';
    /** Chosen replacement attribute values. Only used when `action` is `exchange`. */
    replacement: Record<string, string>;
}

type Drafts = Record<string, LineDraft | undefined>;

export interface ReturnFormProps {
    orderNo: string;
    lines: ReturnableLine[];
    /** Server time (ISO). Every eligibility decision on the page uses this one instant. */
    now: string;
}

function formatDate(iso: string, language: string): string {
    // Fixed zone so the server and browser render the same text.
    return new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso));
}

/** Builds the submission from the drafts. Incomplete drafts are reported instead of guessed at. */
function buildSelection(
    lines: readonly ReturnableLine[],
    drafts: Drafts
): { items: ReturnItem[]; hasIncomplete: boolean } {
    const items: ReturnItem[] = [];
    let hasIncomplete = false;

    for (const line of lines) {
        const draft = drafts[line.lineKey];
        if (!draft) continue;
        if (!draft.reason) {
            hasIncomplete = true;
            continue;
        }
        const replacement = draft.action === 'exchange' ? findVariant(line.variants, draft.replacement) : undefined;
        // An exchange must point at a real, different variant of the same product.
        if (draft.action === 'exchange' && (!replacement || replacement.sku === line.sku)) {
            hasIncomplete = true;
            continue;
        }
        items.push({
            lineKey: line.lineKey,
            sku: line.sku,
            name: line.name,
            imageUrl: line.imageUrl,
            quantity: draft.quantity,
            orderedQuantity: line.quantity,
            action: draft.action,
            reason: draft.reason,
            ...(replacement
                ? {
                      replacementSku: replacement.sku,
                      replacementLabel: Object.values(replacement.variationValues).join(' / '),
                  }
                : {}),
        });
    }
    return { items, hasIncomplete };
}

function ExchangePicker({
    line,
    draft,
    onChange,
}: {
    line: ReturnableLine;
    draft: LineDraft;
    onChange: (replacement: Record<string, string>) => void;
}): ReactElement {
    const { t } = useTranslation('returns');
    return (
        <div className="grid gap-3 sm:grid-cols-2">
            {line.variationAttributes.map((attribute) => {
                const available = getAvailableValues(line.variants, attribute.id);
                const id = `${line.lineKey}-replacement-${attribute.id}`;
                return (
                    <div key={attribute.id} className="space-y-1.5">
                        <Label htmlFor={id}>{attribute.name}</Label>
                        <NativeSelect
                            id={id}
                            value={draft.replacement[attribute.id] ?? ''}
                            aria-label={`${t('form.replacement')}: ${attribute.name}`}
                            onChange={(event) => {
                                const next = applyVariationChange(
                                    line.variants,
                                    draft.replacement,
                                    attribute.id,
                                    event.target.value
                                );
                                if (next) onChange(next);
                            }}>
                            {attribute.values.map((option) => (
                                <NativeSelectOption
                                    key={option.value}
                                    value={option.value}
                                    disabled={!available.has(option.value)}>
                                    {option.name}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    </div>
                );
            })}
        </div>
    );
}

function LineRow({
    line,
    now,
    remaining,
    draft,
    onToggle,
    onChange,
}: {
    line: ReturnableLine;
    now: Date;
    remaining: number;
    draft: LineDraft | undefined;
    onToggle: (line: ReturnableLine, selected: boolean) => void;
    onChange: (lineKey: string, patch: Partial<LineDraft>) => void;
}): ReactElement {
    const { t, i18n } = useTranslation('returns');
    const eligibility = getItemEligibility(line, now);
    const exchangePossible = hasExchangeOptions(line);
    const actions = eligibility.allowedActions.filter((action) => action !== 'exchange' || exchangePossible);
    const selectable = actions.length > 0 && remaining > 0;
    const checkboxId = `${line.lineKey}-select`;

    const reasonText = t(eligibility.reason.key, {
        date: eligibility.reason.values?.date ? formatDate(eligibility.reason.values.date, i18n.language) : undefined,
    });

    return (
        <li className="space-y-4 py-4" data-testid="return-line">
            <div className="flex items-start gap-3">
                <Checkbox
                    id={checkboxId}
                    checked={Boolean(draft)}
                    disabled={!selectable}
                    aria-label={t('form.selectItem', { name: line.name })}
                    onCheckedChange={(checked) => onToggle(line, checked === true)}
                    className="mt-1"
                />
                {line.imageUrl ? (
                    <img
                        src={line.imageUrl}
                        alt=""
                        className="size-16 shrink-0 rounded-ui border border-border object-cover"
                        loading="lazy"
                    />
                ) : (
                    <div className="size-16 shrink-0 rounded-ui border border-border bg-muted" aria-hidden />
                )}
                <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <Label htmlFor={checkboxId} className="font-medium">
                            {line.name}
                        </Label>
                        <ItemStatusBadge status={eligibility.status} />
                    </div>
                    <Typography variant="small" as="p" className="text-muted-foreground">
                        {reasonText}
                    </Typography>
                    {remaining === 0 && (
                        <Typography variant="small" as="p" className="text-muted-foreground">
                            {t('form.alreadyRequested')}
                        </Typography>
                    )}
                    {eligibility.allowedActions.includes('exchange') && !exchangePossible && (
                        <Typography variant="small" as="p" className="text-muted-foreground">
                            {t('form.noExchangeOptions')}
                        </Typography>
                    )}
                </div>
            </div>

            {draft && (
                <div className="ml-7 space-y-4 rounded-ui border border-border bg-muted/40 p-4 sm:ml-10">
                    <div className="grid gap-4 sm:grid-cols-2">
                        {remaining > 1 && (
                            <div className="space-y-1.5">
                                <Label htmlFor={`${line.lineKey}-quantity`}>{t('form.quantity')}</Label>
                                <NativeSelect
                                    id={`${line.lineKey}-quantity`}
                                    value={String(draft.quantity)}
                                    onChange={(event) =>
                                        onChange(line.lineKey, { quantity: Number(event.target.value) })
                                    }>
                                    {Array.from({ length: remaining }, (_, index) => index + 1).map((quantity) => (
                                        <NativeSelectOption key={quantity} value={String(quantity)}>
                                            {quantity}
                                        </NativeSelectOption>
                                    ))}
                                </NativeSelect>
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <Label htmlFor={`${line.lineKey}-reason`}>{t('form.reason')}</Label>
                            <NativeSelect
                                id={`${line.lineKey}-reason`}
                                value={draft.reason}
                                onChange={(event) =>
                                    onChange(line.lineKey, { reason: event.target.value as ReturnReasonId | '' })
                                }>
                                <NativeSelectOption value="">{t('form.reasonPlaceholder')}</NativeSelectOption>
                                {RETURN_REASONS.map((reason) => (
                                    <NativeSelectOption key={reason.id} value={reason.id}>
                                        {t(reason.labelKey)}
                                    </NativeSelectOption>
                                ))}
                            </NativeSelect>
                        </div>
                    </div>

                    <fieldset className="space-y-2">
                        <legend className="text-sm font-medium">{t('form.action')}</legend>
                        <RadioGroup
                            value={draft.action}
                            onValueChange={(value) => onChange(line.lineKey, { action: value as ReturnAction })}
                            className="flex flex-wrap gap-6">
                            {actions.map((action) => {
                                const id = `${line.lineKey}-action-${action}`;
                                return (
                                    <div key={action} className="flex items-center gap-2">
                                        <RadioGroupItem id={id} value={action} />
                                        <Label htmlFor={id}>
                                            {action === 'return' ? t('form.actionReturn') : t('form.actionExchange')}
                                        </Label>
                                    </div>
                                );
                            })}
                        </RadioGroup>
                    </fieldset>

                    {draft.action === 'exchange' && (
                        <ExchangePicker
                            line={line}
                            draft={draft}
                            onChange={(replacement) => onChange(line.lineKey, { replacement })}
                        />
                    )}
                </div>
            )}
        </li>
    );
}

/**
 * The return / exchange form.
 *
 * State model: `drafts` (what the shopper typed) is the only state. Eligibility, remaining quantities, the built
 * selection and whether Submit is enabled are all derived during render, so there is no second copy to drift.
 * There are no effects, so nothing here can loop.
 */
export function ReturnForm({ orderNo, lines, now }: ReturnFormProps): ReactElement {
    const { t, i18n } = useTranslation('returns');
    const navigate = useNavigate();
    const { ready, returns } = useReturns();
    const [drafts, setDrafts] = useState<Drafts>({});
    const [submitting, setSubmitting] = useState(false);
    const [submitFailed, setSubmitFailed] = useState(false);
    // A ref, not state: two fast clicks can both run before React re-renders, but they read the same ref.
    const submittingRef = useRef(false);
    // Idempotency key of this submission. Kept across a retry so a lost reply cannot create two returns; dropped when the
    // selection changes, because a different selection is a different request.
    const requestIdRef = useRef<string | null>(null);

    const nowDate = useMemo(() => new Date(now), [now]);
    const groups = useMemo(() => groupLinesByDelivery(lines), [lines]);
    const requested = useMemo(
        () => getRequestedQuantities(returns.filter((request) => request.orderNo === orderNo)),
        [returns, orderNo]
    );
    const selection = useMemo(() => buildSelection(lines, drafts), [lines, drafts]);
    const selectedCount = Object.values(drafts).filter(Boolean).length;
    const validation = useMemo(
        () => validateSelection(selection.items, lines, requested, nowDate),
        [selection.items, lines, requested, nowDate]
    );
    const canSubmit = ready && !submitting && !selection.hasIncomplete && validation.ok;

    const handleToggle = useCallback(
        (line: ReturnableLine, selected: boolean) => {
            requestIdRef.current = null;
            setDrafts((previous) => {
                if (!selected) {
                    return Object.fromEntries(Object.entries(previous).filter(([key]) => key !== line.lineKey));
                }
                if (previous[line.lineKey]) return previous;
                const eligibility = getItemEligibility(line, nowDate);
                const remaining = line.quantity - (requested.get(line.lineKey) ?? 0);
                const action: ReturnAction = eligibility.allowedActions.includes('return') ? 'return' : 'exchange';
                return {
                    ...previous,
                    [line.lineKey]: {
                        quantity: Math.max(1, remaining),
                        action,
                        reason: '',
                        replacement: line.variationValues,
                    },
                };
            });
        },
        [nowDate, requested]
    );

    const handleChange = useCallback((lineKey: string, patch: Partial<LineDraft>) => {
        requestIdRef.current = null;
        setDrafts((previous) => {
            const current = previous[lineKey];
            return current ? { ...previous, [lineKey]: { ...current, ...patch } } : previous;
        });
    }, []);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
        event.preventDefault();
        if (submittingRef.current || !canSubmit) return;
        submittingRef.current = true;
        setSubmitting(true);
        setSubmitFailed(false);

        try {
            // Re-check against the store as it is right now, not as it was at the last render.
            const fresh = getRequestedQuantities(
                getReturnsSnapshot().returns.filter((request) => request.orderNo === orderNo)
            );
            const result = validateSelection(selection.items, lines, fresh, nowDate);
            if (!result.ok) throw new Error(result.error);

            requestIdRef.current ??= crypto.randomUUID();
            const request = await createReturn({
                orderNo,
                items: selection.items,
                clientRequestId: requestIdRef.current,
            });
            await navigate(routeHref(routes.accountReturnDetail, { rmaNo: request.rmaNo }));
        } catch {
            submittingRef.current = false;
            setSubmitting(false);
            setSubmitFailed(true);
        }
    };

    if (lines.length === 0) {
        return (
            <Typography variant="p" className="text-muted-foreground">
                {t('form.noLines')}
            </Typography>
        );
    }

    return (
        <form onSubmit={handleSubmit} noValidate className="space-y-6">
            {groups.map((group, index) => (
                <Card key={group.deliveryId}>
                    <CardContent className="space-y-1 p-6">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <Typography variant="h3" as="h2" className="text-base font-semibold">
                                {group.lines[0]?.deliveryCity
                                    ? t('form.deliveryFrom', { index: index + 1, city: group.lines[0].deliveryCity })
                                    : t('form.delivery', { index: index + 1 })}
                            </Typography>
                            {group.lines[0]?.deliveryCity && group.lines[0].deliveredAt && (
                                <Typography variant="small" as="span" className="text-muted-foreground">
                                    {t('form.deliveredOn', {
                                        date: formatDate(group.lines[0].deliveredAt, i18n.language),
                                    })}
                                </Typography>
                            )}
                        </div>
                        <ul className="divide-y divide-border">
                            {group.lines.map((line) => (
                                <LineRow
                                    key={line.lineKey}
                                    line={line}
                                    now={nowDate}
                                    remaining={line.quantity - (requested.get(line.lineKey) ?? 0)}
                                    draft={drafts[line.lineKey]}
                                    onToggle={handleToggle}
                                    onChange={handleChange}
                                />
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            ))}

            <div className="space-y-2" aria-live="polite">
                {selection.hasIncomplete && (
                    <Typography variant="small" as="p" className="text-muted-foreground">
                        {t('form.incompleteHint')}
                    </Typography>
                )}
                {submitFailed && (
                    <Typography variant="small" as="p" role="alert" className="text-destructive">
                        {t('form.submitError')}
                    </Typography>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-4">
                <Button type="submit" disabled={!canSubmit} data-testid="return-submit">
                    {submitting ? t('form.submitting') : t('form.submit')}
                </Button>
                {selectedCount > 0 && (
                    <Typography variant="small" as="span" className="text-muted-foreground">
                        {t('form.selectedCount', { count: selectedCount })}
                    </Typography>
                )}
            </div>
        </form>
    );
}
