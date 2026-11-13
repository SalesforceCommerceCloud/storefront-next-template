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
/** @sfdc-extension-file SFDC_EXT_APPOINTMENT_SCHEDULING */
import { type FormEvent, type ReactElement, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetcher } from 'react-router';
import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import type { ServiceTerritoryOption } from '@/lib/appointment-scheduler';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

// Local type — canonical wizard does not require a commerce catalogue.
type AppointmentPiece = {
    id: string;
    name: string;
    reference?: string;
    image?: string;
    collection?: string;
};

const BOOKING_WINDOW_DAYS = 90;

interface ServiceEntry {
    id: string;
    workType: string;
    minutes: number;
    titleKey: string | null;
    title?: string;
    hintKey?: string;
    image?: string;
    workTypeGroupId?: string;
}

const STEPS = ['location', 'service', 'when', 'review'] as const;
type WizardStep = (typeof STEPS)[number];

const STEP_NAV = {
    location: 'boutiquesPage.stepNavLocation',
    service: 'boutiquesPage.stepNavService',
    when: 'boutiquesPage.stepNavWhen',
    review: 'boutiquesPage.stepNavReview',
} as const satisfies Record<WizardStep, `boutiquesPage.${string}`>;

function isoFromParts(year: number, monthIndex: number, day: number): string {
    return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function localIsoToday(): string {
    const now = new Date();
    return isoFromParts(now.getFullYear(), now.getMonth(), now.getDate());
}

function addDaysIso(iso: string, days: number): string {
    const [year, month, day] = iso.split('-').map(Number);
    const next = new Date(year, month - 1, day + days);
    return isoFromParts(next.getFullYear(), next.getMonth(), next.getDate());
}

/**
 * Format an ISO 8601 timestamp to a time label (HH:MM, 24-hour format) in the given timezone.
 *
 * @param startTimeIso - ISO 8601 timestamp
 * @param locale - BCP 47 locale (e.g. 'en-US')
 * @param timezone - IANA timezone string (e.g. 'Europe/London'); defaults to browser local timezone
 * @returns Time label in the specified timezone (e.g. '14:00')
 */
function slotTimeLabel(startTimeIso: string, locale: string, timezone?: string): string {
    const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
    if (timezone) opts.timeZone = timezone;
    return new Intl.DateTimeFormat(locale, opts).format(new Date(startTimeIso));
}

/**
 * Extract a date key (YYYY-MM-DD) from an ISO 8601 timestamp in a given timezone.
 * The timezone should match the territory so the calendar dates align with
 * local time (e.g. a slot at 11:00 UTC/London appears on Oct 29, not Oct 28
 * for a shopper browsing in PDT).
 *
 * When no timezone is provided falls back to the runtime's local timezone so that
 * the slot date keys are consistent with the calendar's date keys (both use the
 * same timezone reference).
 *
 * @param startTimeIso - ISO 8601 timestamp
 * @param timezone - IANA timezone string; defaults to runtime local timezone
 * @returns Date key (YYYY-MM-DD) in the specified timezone
 */
function slotDateKey(startTimeIso: string, timezone?: string): string {
    if (!timezone) {
        const d = new Date(startTimeIso);
        return isoFromParts(d.getFullYear(), d.getMonth(), d.getDate());
    }
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date(startTimeIso));
    const year = parts.find((p) => p.type === 'year')?.value ?? '';
    const month = parts.find((p) => p.type === 'month')?.value ?? '';
    const day = parts.find((p) => p.type === 'day')?.value ?? '';
    return `${year}-${month}-${day}`;
}

function monthKey(year: number, monthIndex: number): string {
    return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function shiftMonth(year: number, monthIndex: number, delta: number): { year: number; month: number } {
    const next = new Date(year, monthIndex + delta, 1);
    return { year: next.getFullYear(), month: next.getMonth() };
}

function monthTitle(year: number, monthIndex: number, locale: string): string {
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(year, monthIndex, 1));
}

function weekdayLabels(locale: string, start: 0 | 1): string[] {
    const sunday = new Date(2026, 8, 6);
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    return Array.from({ length: 7 }, (_, index) => {
        const day = new Date(sunday);
        day.setDate(sunday.getDate() + ((start + index) % 7));
        return fmt.format(day);
    });
}

function dayAriaLabel(iso: string, locale: string): string {
    const [year, month, day] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    }).format(new Date(year, month - 1, day));
}

function weekStartsOn(locale: string): 0 | 1 {
    return locale.toLowerCase().startsWith('en-us') ? 0 : 1;
}

function MonthCalendar({
    locale,
    minDate,
    selected,
    hasSlots,
    onSelect,
}: {
    locale: string;
    minDate: string;
    selected: string;
    hasSlots: (iso: string) => boolean;
    onSelect: (iso: string) => void;
}): ReactElement {
    const { t } = useTranslation('extAppointmentScheduling');
    const maxDate = addDaysIso(minDate, BOOKING_WINDOW_DAYS);
    const start = weekStartsOn(locale);
    const [cursor, setCursor] = useState(() => {
        const iso = selected || minDate;
        const [year, month] = iso.split('-').map(Number);
        return { year, month: month - 1 };
    });

    useEffect(() => {
        if (!selected) return;
        const [year, month] = selected.split('-').map(Number);
        setCursor((current) =>
            current.year === year && current.month === month - 1 ? current : { year, month: month - 1 }
        );
    }, [selected]);

    const title = monthTitle(cursor.year, cursor.month, locale);
    const cursorMonth = monthKey(cursor.year, cursor.month);
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const pad = (new Date(cursor.year, cursor.month, 1).getDay() - start + 7) % 7;
    const leadingPads = Array.from({ length: pad }, (_, slot) => `${cursorMonth}-lead-${slot}`);
    const monthDays = Array.from({ length: daysInMonth }, (_, day) => isoFromParts(cursor.year, cursor.month, day + 1));
    const canPrev = cursorMonth > minDate.slice(0, 7);
    const canNext = cursorMonth < maxDate.slice(0, 7);

    return (
        <div data-testid="appointment-calendar" role="group" aria-label={t('boutiquesPage.date')}>
            <div className="flex items-center justify-between gap-3">
                <p className="font-serif text-3xl">{title}</p>
                <div className="flex gap-1">
                    <button
                        type="button"
                        className="inline-flex size-10 items-center justify-center disabled:text-muted-foreground/40"
                        aria-label={t('boutiquesPage.calendarPrev')}
                        disabled={!canPrev}
                        onClick={() => setCursor((current) => shiftMonth(current.year, current.month, -1))}>
                        <ChevronLeft className="size-5" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        className="inline-flex size-10 items-center justify-center disabled:text-muted-foreground/40"
                        aria-label={t('boutiquesPage.calendarNext')}
                        disabled={!canNext}
                        onClick={() => setCursor((current) => shiftMonth(current.year, current.month, 1))}>
                        <ChevronRight className="size-5" aria-hidden="true" />
                    </button>
                </div>
            </div>
            <div className="mt-5" role="grid" aria-label={title}>
                <div className="grid grid-cols-7 border-b border-border pb-2.5 text-center text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    {weekdayLabels(locale, start).map((label) => (
                        <span key={label}>{label}</span>
                    ))}
                </div>
                <div className="mt-2 grid grid-cols-7 gap-1">
                    {leadingPads.map((padKey) => (
                        <span key={padKey} />
                    ))}
                    {monthDays.map((iso) => {
                        const available = iso >= minDate && iso <= maxDate && hasSlots(iso);
                        const isSelected = selected === iso;
                        const isToday = iso === minDate;
                        return (
                            <button
                                key={iso}
                                type="button"
                                data-date={iso}
                                data-testid={available ? 'appointment-day' : undefined}
                                disabled={!available}
                                aria-pressed={isSelected}
                                aria-label={dayAriaLabel(iso, locale)}
                                onClick={() => onSelect(iso)}
                                className={cn(
                                    'h-12 text-base tabular-nums',
                                    isSelected && 'bg-foreground text-primary-foreground',
                                    !available && 'text-muted-foreground/35',
                                    available && !isSelected && 'hover:bg-muted',
                                    isToday && !isSelected && 'underline decoration-foreground/40 underline-offset-4'
                                )}>
                                {Number(iso.slice(-2))}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export type AppointmentWizardProps = {
    stores: ServiceTerritoryOption[];
    productId?: string;
    productName?: string;
    /**
     * Real appointment availability slots — used as a prop fallback for tests/Storybook
     * when the `useFetcher` hasn't run yet. In production the component fetches its own
     * availability via the `/resource/appointment-availability` resource route.
     */
    availability?: { startTime: string; endTime: string }[];
    /**
     * Minimum advance notice in minutes before a slot can be booked.
     * Slots starting sooner than this from now are hidden in the calendar.
     * Sourced from `config.features.appointment.advanceNoticeMinutes` (BM-configurable).
     * Default: 120 (2 hours).
     */
    advanceNoticeMinutes?: number;
    /**
     * IANA timezone of the territory (e.g. 'Europe/London').
     * Used to group availability slots by local date so the calendar correctly
     * highlights dates in the territory's timezone rather than the shopper's browser timezone.
     * When omitted, slot times are displayed in the shopper's local timezone.
     */
    timezone?: string;
    /**
     * Callback to book an appointment via the real resource route.
     * When absent (Storybook, existing tests), the component falls back to sessionStorage demo mode.
     */
    onBook?: (formData: FormData) => void;
    /**
     * Whether the booking submission is in-flight. Sourced from `bookingFetcher.state !== 'idle'`
     * in the parent page. Used to disable the submit button while waiting for the response.
     */
    bookingSubmitting?: boolean;
    /**
     * Result of the last booking submission. Sourced from `bookingFetcher.data` in the parent page.
     * The component watches this via `useEffect` to transition to the confirmation screen or show
     * an error when the fetcher settles.
     */
    bookingResult?: { success: boolean; serviceAppointmentId?: string; error?: string };
};

function formatReviewDate(iso: string, locale: string): string {
    const [year, month, day] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    }).format(new Date(year, month - 1, day));
}

function addressLine(store: ServiceTerritoryOption): string {
    return [store.address1, store.postalCode, store.city].filter(Boolean).join(', ');
}

function enrichPiece(
    piece: AppointmentPiece | null | undefined,
    productId?: string,
    productName?: string
): AppointmentPiece | null {
    const id = piece?.id || productId;
    if (!id && !productName) return null;
    return {
        id: id ?? '',
        name: piece?.name || productName || '',
        reference: piece?.reference,
        image: piece?.image,
        collection: piece?.collection,
    };
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }): ReactElement {
    return (
        <div className="flex min-w-0 flex-col gap-2">
            <label className="text-sm" htmlFor={id}>
                {label}
            </label>
            {children}
        </div>
    );
}

function PieceCard({ piece }: { piece: AppointmentPiece }): ReactElement {
    const { t } = useTranslation('extAppointmentScheduling');
    return (
        <div data-testid="appointment-product" className="flex gap-4 bg-muted/40 p-4 md:items-center md:gap-5">
            {piece.image ? (
                <img src={piece.image} alt={piece.name} className="size-20 shrink-0 bg-background object-contain" />
            ) : (
                <div className="size-20 shrink-0 bg-muted" aria-hidden="true" />
            )}
            <div className="min-w-0">
                {piece.collection ? (
                    <p className="text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">
                        {piece.collection}
                    </p>
                ) : null}
                <p className="mt-1 font-serif text-base leading-snug md:text-lg">{piece.name}</p>
                {piece.reference ? (
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {t('reference', { ref: piece.reference })}
                    </p>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">{t('boutiquesPage.appointmentProductHint')}</p>
            </div>
            <input type="hidden" name="productId" value={piece.id} />
            <input type="hidden" name="productName" value={piece.name} />
            {piece.reference ? <input type="hidden" name="productReference" value={piece.reference} /> : null}
        </div>
    );
}

function ServiceCard({
    selected,
    title,
    details,
    minutes,
    image,
    onSelect,
}: {
    selected: boolean;
    title: string;
    details: string;
    minutes: number;
    image?: string;
    onSelect: () => void;
}): ReactElement {
    const { t } = useTranslation('extAppointmentScheduling');
    return (
        <button
            type="button"
            aria-pressed={selected}
            onClick={onSelect}
            data-testid="appointment-service"
            className={cn(
                'w-full overflow-hidden border text-left transition-colors',
                image ? 'grid grid-cols-[7.5rem_minmax(0,1fr)]' : '',
                selected ? 'border-foreground bg-muted/40' : 'border-border hover:border-foreground/40'
            )}>
            {image ? <img src={image} alt="" className="h-full min-h-[7.5rem] w-full object-cover" /> : null}
            <span className="flex min-w-0 flex-col justify-center p-3 sm:p-4">
                <span className="font-serif text-lg">{title}</span>
                <span className="mt-1 text-sm text-muted-foreground">{details}</span>
                <span className="mt-2 text-[0.6875rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    {t('boutiquesPage.durationLine', { minutes })}
                </span>
            </span>
        </button>
    );
}

function WizardStepper({
    step,
    maxReached,
    onGoTo,
}: {
    step: WizardStep;
    maxReached: number;
    onGoTo: (next: WizardStep) => void;
}): ReactElement {
    const { t } = useTranslation('extAppointmentScheduling');
    const stepIndex = STEPS.indexOf(step);
    return (
        <nav aria-label={t('boutiquesPage.appointmentTitle')} className="w-fit max-w-full shrink-0">
            <ol className="flex items-start" data-testid="appointment-stepper">
                {STEPS.map((id, index) => {
                    const current = id === step;
                    const reachable = index <= maxReached;
                    const label = t(STEP_NAV[id]) as string;
                    const circle = (
                        <span
                            className={cn(
                                'flex size-9 items-center justify-center border text-sm',
                                current
                                    ? 'border-foreground bg-foreground text-primary-foreground'
                                    : reachable
                                      ? 'border-foreground text-foreground'
                                      : 'border-border text-muted-foreground'
                            )}>
                            {index + 1}
                        </span>
                    );
                    const body = (
                        <>
                            {circle}
                            <span
                                className={cn(
                                    'mt-2 text-center text-[0.6875rem] uppercase tracking-[0.12em]',
                                    current || reachable ? 'text-foreground' : 'text-muted-foreground'
                                )}>
                                {label}
                            </span>
                        </>
                    );
                    return (
                        <li key={id} className="flex shrink-0 items-center">
                            {reachable && !current ? (
                                <button
                                    type="button"
                                    aria-label={label}
                                    onClick={() => onGoTo(id)}
                                    className="flex w-14 flex-col items-center">
                                    {body}
                                </button>
                            ) : (
                                <div
                                    aria-current={current ? 'step' : undefined}
                                    className="flex w-14 flex-col items-center">
                                    {body}
                                </div>
                            )}
                            {index < STEPS.length - 1 ? (
                                <span
                                    className={cn('mb-6 h-px w-6', index < stepIndex ? 'bg-foreground' : 'bg-border')}
                                    aria-hidden="true"
                                />
                            ) : null}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}

function SummaryRow({ title, detail, onEdit }: { title: string; detail?: string; onEdit: () => void }): ReactElement {
    const { t } = useTranslation('extAppointmentScheduling');
    return (
        <div className="flex items-center justify-between gap-3 border-b border-border py-2.5">
            <div className="min-w-0">
                <p className="font-serif text-base leading-snug">{title}</p>
                {detail ? <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p> : null}
            </div>
            <button
                type="button"
                onClick={onEdit}
                className="inline-flex shrink-0 items-center gap-1 text-xs"
                aria-label={`${t('boutiquesPage.edit') as string} ${title}`}>
                {t('boutiquesPage.edit')}
                <Pencil className="size-3" aria-hidden="true" />
            </button>
        </div>
    );
}

// Read-only summary row for the post-submit confirmation. Rendered inside a <dl> so screen
// readers hear each value with its term (the term is visually hidden to keep the Review-step look).
function ReviewDetail({ term, title, detail }: { term: string; title: string; detail?: string }): ReactElement {
    return (
        <div className="border-b border-border py-2.5">
            <dt className="sr-only">{term}</dt>
            <dd className="m-0">
                <p className="font-serif text-base leading-snug">{title}</p>
                {detail ? <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p> : null}
            </dd>
        </div>
    );
}

export default function AppointmentWizard({
    stores,
    productId,
    productName,
    availability,
    advanceNoticeMinutes = 120,
    timezone,
    onBook,
    bookingSubmitting,
    bookingResult,
}: AppointmentWizardProps): ReactElement {
    const { t, i18n } = useTranslation('extAppointmentScheduling');
    const [done, setDone] = useState(false);
    const [step, setStep] = useState<WizardStep>('location');
    const [maxReached, setMaxReached] = useState(0);
    const [externalId, setExternalId] = useState('');
    const [reason, setReason] = useState('');
    const [workType, setWorkType] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    // Store the full slot at pick time so submit doesn't depend on daySlots being recomputed.
    const [chosenSlot, setChosenSlot] = useState<{ startTime: string; endTime: string } | null>(null);
    const [bookingError, setBookingError] = useState<string | null>(null);
    const store = stores.find((entry) => entry.id === externalId) ?? null;
    const locked = useMemo(() => enrichPiece(null, productId, productName), [productId, productName]);
    const minDate = useMemo(() => localIsoToday(), []);

    const workTypesFetcher = useFetcher<{
        success: boolean;
        workTypes?: { id: string; name: string; durationMinutes: number; workTypeGroupId: string }[];
        /** Echoed from the server so we can verify the response belongs to the requested territory. */
        territoryId?: string;
    }>();

    // ref tracks which store is currently in-flight (won't cause re-renders)
    const fetchingForStore = useRef('');
    // state tracks which store's data is actually loaded and valid to display
    const [dataExternalId, setDataExternalId] = useState('');

    useEffect(() => {
        if (externalId && workTypesFetcher.state === 'idle' && externalId !== fetchingForStore.current) {
            fetchingForStore.current = externalId;
            void workTypesFetcher.load(
                `/resource/appointment-work-types?territoryId=${encodeURIComponent(externalId)}`
            );
        }
    }, [externalId, workTypesFetcher]);

    // Only mark data as valid when the server confirms the response belongs to the current territory.
    // Using the echoed territoryId from the response (not fetchingForStore.current) prevents a race
    // where switching boutiques advances the ref before the old response arrives.
    // On failure the server omits territoryId — fall back to the ref so isLoadingWorkTypes clears.
    useEffect(() => {
        const respondedId = workTypesFetcher.data?.territoryId;
        if (workTypesFetcher.state === 'idle' && workTypesFetcher.data !== undefined) {
            setDataExternalId(respondedId ?? fetchingForStore.current);
        }
    }, [workTypesFetcher.state, workTypesFetcher.data]);

    const dynamicServices = useMemo(() => {
        if (
            workTypesFetcher.data?.success &&
            workTypesFetcher.data.workTypes?.length &&
            dataExternalId === externalId
        ) {
            return workTypesFetcher.data.workTypes.map((wt) => ({
                id: wt.id,
                workType: wt.id,
                minutes: wt.durationMinutes,
                titleKey: null as null,
                title: wt.name,
                workTypeGroupId: wt.workTypeGroupId,
            }));
        }
        return null;
    }, [workTypesFetcher.data, dataExternalId, externalId]);

    // Loading: territory selected but no fetch result yet (includes in-flight).
    // Show loading when selected territory's data hasn't arrived yet (dataExternalId lags behind externalId).
    const isLoadingWorkTypes = externalId !== '' && externalId !== dataExternalId;
    const effectiveServices: ServiceEntry[] = isLoadingWorkTypes ? [] : (dynamicServices ?? []);

    const availabilityFetcher = useFetcher<{
        success: boolean;
        slots: { startTime: string; endTime: string }[];
        timezone?: string;
    }>();

    // Transition to the confirmation screen (or show an error) when the booking fetcher settles.
    useEffect(() => {
        if (bookingResult?.success) {
            setDone(true);
        } else if (bookingResult && !bookingResult.success) {
            setBookingError(bookingResult.error || t('boutiquesPage.bookingError'));
        }
    }, [bookingResult, t]);

    // Prefer fetcher data (production); fall back to the `availability` prop (tests/Storybook).
    const realSlots = availabilityFetcher.data?.success ? availabilityFetcher.data.slots : availability;
    const isLoadingAvailability = availabilityFetcher.state === 'loading';

    // Territory timezone: prefer what the server returned (OperatingHours.TimeZone), then the
    // prop (territory-level override). When neither is available (e.g. in Storybook / tests where
    // availability is prop-driven and slots are authored in local time), leave undefined so
    // slotTimeLabel and slotDateKey fall back to the runtime's local timezone — making test
    // assertions timezone-safe.
    const territoryTimezone = availabilityFetcher.data?.timezone ?? timezone;

    // Group real slots by local date for calendar highlighting and time-slot display.
    // Slots starting within `advanceNoticeMinutes` of now are filtered out.
    // The threshold is BM-configurable via site preference `sfnextAppointmentAdvanceNoticeMinutes`
    // (sourced from config.features.appointment.advanceNoticeMinutes, default 120 = 2 hours).
    const availableByDate = useMemo(() => {
        if (!realSlots) return null;
        const cutoff = Date.now() + advanceNoticeMinutes * 60 * 1000;
        const map = new Map<string, { label: string; startTime: string; endTime: string }[]>();
        for (const slot of realSlots) {
            if (new Date(slot.startTime).getTime() < cutoff) continue; // too soon
            const key = slotDateKey(slot.startTime, territoryTimezone);
            const entry = {
                label: slotTimeLabel(slot.startTime, i18n.language, territoryTimezone),
                startTime: slot.startTime,
                endTime: slot.endTime,
            };
            const existing = map.get(key);
            if (existing) existing.push(entry);
            else map.set(key, [entry]);
        }
        return map;
    }, [realSlots, i18n.language, territoryTimezone, advanceNoticeMinutes]);

    const availabilityUnavailable =
        availabilityFetcher.state === 'idle' &&
        availabilityFetcher.data !== undefined &&
        (availabilityFetcher.data.success === false ||
            (availabilityFetcher.data.success === true && availableByDate !== null && availableByDate.size === 0));

    const daySlots = useMemo(() => {
        if (!availableByDate) return [];
        return availableByDate.get(date) ?? [];
    }, [availableByDate, date]);

    // Format the ISO startTime for human-readable display (e.g. '10:00').
    // The `time` state stores the raw ISO so it can be passed to onBook; display
    // and the demo sessionStorage path use the formatted label instead.
    const timeLabel = useMemo(
        () => (time ? slotTimeLabel(time, i18n.language, territoryTimezone) : ''),
        [time, i18n.language, territoryTimezone]
    );

    const selectedService = effectiveServices.find((entry) => entry.id === reason);
    const stepIndex = STEPS.indexOf(step);

    const goTo = (next: WizardStep) => {
        const index = STEPS.indexOf(next);
        if (index <= maxReached) setStep(next);
    };

    const advanceTo = (next: WizardStep) => {
        const index = STEPS.indexOf(next);
        setMaxReached((current) => Math.max(current, index));
        setStep(next);
    };

    const goBack = () => {
        if (stepIndex > 0) setStep(STEPS[stepIndex - 1]);
    };

    const pickBoutique = (id: string) => {
        if (id !== externalId) {
            setDate('');
            setTime('');
        }
        setExternalId(id);
        advanceTo('service');
    };

    const pickService = (id: string) => {
        const service = effectiveServices.find((entry) => entry.id === id);
        if (!service) return;
        setReason(service.id);
        setWorkType(service.workType);
        const groupId = service.workTypeGroupId ?? '';

        // Fetch real availability for this territory + service (next 30 days).
        const startTime = new Date().toISOString();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);
        const availUrl = new URL('/resource/appointment-availability', window.location.origin);
        availUrl.searchParams.set('startTime', startTime);
        availUrl.searchParams.set('endTime', endDate.toISOString());
        availUrl.searchParams.set('territoryId', externalId);
        availUrl.searchParams.set('workTypeId', id);
        if (groupId) availUrl.searchParams.set('workTypeGroupId', groupId);
        void availabilityFetcher.load(availUrl.pathname + availUrl.search);

        advanceTo('when');
    };

    const pickTime = (slotStartTime: string) => {
        const slot = daySlots.find((s) => s.startTime === slotStartTime) ?? null;
        setTime(slotStartTime);
        setChosenSlot(slot); // cache at pick time — submit won't re-lookup from daySlots
        advanceTo('review');
    };

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!store) return;
        const form = new FormData(event.currentTarget);
        const formProductId = String(form.get('productId') ?? '').trim();
        const formProductName = String(form.get('productName') ?? '').trim();
        const formProductReference = String(form.get('productReference') ?? '').trim();
        const name = String(form.get('name') ?? '').trim();
        const email = String(form.get('email') ?? '').trim();
        const phone = String(form.get('phone') ?? '').trim();
        const notes = String(form.get('notes') ?? '').trim();

        if (!name || !email || !date || !time) return;

        if (onBook) {
            // Use the slot cached at pick time — avoids any re-computation dependency on daySlots.
            if (!chosenSlot) {
                setBookingError(t('boutiquesPage.bookingError'));
                return;
            }

            // Build the subject from selected product name + service title (filter falsy, join with ' · ').
            const serviceTitle = selectedService
                ? selectedService.titleKey
                    ? t(selectedService.titleKey as never)
                    : (selectedService as { title?: string }).title
                : undefined;
            const subjectParts = [locked?.name, serviceTitle].filter(Boolean);
            const subject = subjectParts.length > 0 ? subjectParts.join(' · ') : undefined;

            setBookingError(null);
            const fd = new FormData();
            fd.append('schedStartTime', chosenSlot.startTime);
            fd.append('schedEndTime', chosenSlot.endTime);
            fd.append('email', email);
            if (subject) fd.append('subject', subject);
            if (reason) fd.append('workTypeId', reason);
            if (store.id) fd.append('territoryId', store.id);
            onBook(fd);
        } else {
            // Storybook / test path: no booking backend wired, persist to sessionStorage for story inspection.
            const payload = {
                externalId: store.id,
                storeName: store.name,
                productId: locked?.id || formProductId || null,
                productName: locked?.name || formProductName || null,
                productReference: locked?.reference || formProductReference || null,
                reason,
                workType,
                name,
                email,
                phone,
                date,
                time: timeLabel,
                notes,
            };
            const key = `appointment:${payload.productId || 'browse'}:${store.id}`;
            sessionStorage.setItem(key, JSON.stringify(payload));
            setDone(true);
        }
    };

    const confirmationStatusRef = useRef<HTMLParagraphElement>(null);
    // Submitting unmounts the Review form (and its submit button), which would otherwise drop focus
    // to <body>. Move focus to the confirmation message so keyboard and screen-reader users land in
    // the new view (the message is also an aria-live region).
    useEffect(() => {
        if (done) confirmationStatusRef.current?.focus();
    }, [done]);

    const heading = (
        <h1 className="min-w-0 font-serif text-3xl font-normal tracking-tight sm:text-4xl">
            {t('boutiquesPage.appointmentTitle')}
        </h1>
    );

    const chrome = (
        <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
            {heading}
            <WizardStepper step={step} maxReached={maxReached} onGoTo={goTo} />
        </header>
    );

    const pieceLead = locked && step !== 'review' ? <PieceCard piece={locked} /> : null;

    if (done && store) {
        return (
            <div
                id="appointment"
                className="flex h-full min-h-0 flex-1 flex-col scroll-mt-[calc(var(--header-height,72px)+1.5rem)] px-4 sm:px-6 lg:px-8 py-8"
                data-testid="boutique-appointment">
                <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">{heading}</header>
                <p
                    ref={confirmationStatusRef}
                    tabIndex={-1}
                    role="status"
                    data-testid="appointment-success"
                    className="mt-8 font-serif text-3xl outline-none">
                    {t('boutiquesPage.success', { salon: store.name })}
                    {locked ? (
                        <span className="mt-4 block font-sans text-base text-muted-foreground">
                            {t('boutiquesPage.successProduct', { product: locked.name })}
                        </span>
                    ) : null}
                </p>
                <section
                    aria-labelledby="appointment-summary-heading"
                    className="mt-8"
                    data-testid="appointment-summary">
                    <h2 id="appointment-summary-heading" className="sr-only">
                        {t('boutiquesPage.stepReview')}
                    </h2>
                    <dl>
                        <ReviewDetail
                            term={t('boutiquesPage.stepNavLocation')}
                            title={store.name ?? store.id ?? ''}
                            detail={addressLine(store)}
                        />
                        <ReviewDetail
                            term={t('boutiquesPage.stepNavService')}
                            title={
                                selectedService
                                    ? selectedService.titleKey
                                        ? t(selectedService.titleKey as never)
                                        : ((selectedService as { title?: string }).title ??
                                          t('boutiquesPage.stepNavService'))
                                    : t('boutiquesPage.stepNavService')
                            }
                            detail={
                                selectedService
                                    ? t('boutiquesPage.durationLine', { minutes: selectedService.minutes })
                                    : undefined
                            }
                        />
                        <ReviewDetail
                            term={t('boutiquesPage.stepNavWhen')}
                            title={date ? formatReviewDate(date, i18n.language) : t('boutiquesPage.stepNavWhen')}
                            detail={timeLabel || undefined}
                        />
                    </dl>
                </section>
            </div>
        );
    }

    const stageRight = (
        <>
            {chrome}
            {pieceLead ? <div className="mt-8">{pieceLead}</div> : null}
            {step === 'service' ? (
                <fieldset className="mt-6 flex min-w-0 flex-col p-0">
                    <legend className="float-none mb-0 p-0 font-serif text-2xl">{t('boutiquesPage.stepReason')}</legend>
                    {isLoadingWorkTypes ? (
                        <div
                            role="status"
                            className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                            {t('boutiquesPage.loadingServices')}
                        </div>
                    ) : effectiveServices.length === 0 ? (
                        <div
                            role="status"
                            className="mt-6 rounded-lg border border-border p-6 text-sm text-muted-foreground">
                            <p>{t('boutiquesPage.appointmentUnavailable')}</p>
                            {store?.phone && <p className="mt-3 font-medium text-foreground">{store.phone}</p>}
                        </div>
                    ) : (
                        <div className="mt-5 grid grid-cols-1 gap-4 @3xl:grid-cols-2">
                            {effectiveServices.map((entry) => (
                                <ServiceCard
                                    key={entry.id}
                                    selected={reason === entry.id}
                                    title={
                                        entry.titleKey
                                            ? t(entry.titleKey as never)
                                            : ((entry as { title?: string }).title ?? entry.id)
                                    }
                                    details={entry.hintKey ? t(entry.hintKey as never) : ''}
                                    minutes={entry.minutes}
                                    image={entry.id === 'view' && locked?.image ? locked.image : entry.image}
                                    onSelect={() => pickService(entry.id)}
                                />
                            ))}
                        </div>
                    )}
                </fieldset>
            ) : null}

            {step === 'when' && store ? (
                availabilityUnavailable ? (
                    <div
                        role="status"
                        className="mt-6 rounded-lg border border-border p-6 text-sm text-muted-foreground">
                        <p>{t('boutiquesPage.appointmentUnavailable')}</p>
                        {store?.phone && <p className="mt-3 font-medium text-foreground">{store.phone}</p>}
                    </div>
                ) : isLoadingAvailability && !availableByDate ? (
                    <div role="status" className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                        Loading availability…
                    </div>
                ) : (availableByDate && availableByDate.size > 0) || !isLoadingAvailability ? (
                    <fieldset className="mt-6 flex min-w-0 flex-col gap-5 p-0">
                        <legend className="float-none mb-0 p-0 font-serif text-2xl">
                            {t('boutiquesPage.stepWhen')}
                        </legend>
                        <div className="grid gap-8 lg:grid-cols-[minmax(26rem,36rem)_minmax(10rem,14rem)] lg:items-start">
                            <MonthCalendar
                                locale={i18n.language}
                                minDate={minDate}
                                selected={date}
                                hasSlots={(iso) =>
                                    isLoadingAvailability ? false : (availableByDate?.get(iso)?.length ?? 0) > 0
                                }
                                onSelect={(iso) => {
                                    setDate(iso);
                                    setTime('');
                                    setChosenSlot(null);
                                }}
                            />
                            <div className="lg:border-l lg:border-border lg:pl-6">
                                <p className="text-[0.6875rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                                    {t('boutiquesPage.availableTimes')}
                                </p>
                                {!date ? (
                                    <p className="mt-4 text-sm text-muted-foreground">
                                        {t('boutiquesPage.pickDateFirst')}
                                    </p>
                                ) : daySlots.length === 0 ? (
                                    <p className="mt-4 text-sm text-muted-foreground">
                                        {t('boutiquesPage.noFilterMatches')}
                                    </p>
                                ) : (
                                    <ul className="mt-4 flex flex-col gap-2">
                                        {daySlots.map((s) => (
                                            <li key={s.startTime}>
                                                <Button
                                                    type="button"
                                                    variant={time === s.startTime ? 'default' : 'outline'}
                                                    className="h-auto w-full py-3"
                                                    onClick={() => pickTime(s.startTime)}
                                                    aria-pressed={time === s.startTime}>
                                                    {s.label}
                                                </Button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    </fieldset>
                ) : null
            ) : null}

            {step === 'review' && store ? (
                <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-8">
                    <div className="grid gap-8 @3xl:grid-cols-2 @3xl:items-start">
                        <div>
                            <h2 className="sr-only">{t('boutiquesPage.stepReview')}</h2>
                            <SummaryRow
                                title={store.name ?? store.id ?? ''}
                                detail={addressLine(store)}
                                onEdit={() => goTo('location')}
                            />
                            <SummaryRow
                                title={
                                    selectedService
                                        ? selectedService.titleKey
                                            ? t(selectedService.titleKey as never)
                                            : (selectedService.title ?? t('boutiquesPage.stepNavService'))
                                        : t('boutiquesPage.stepNavService')
                                }
                                detail={
                                    selectedService
                                        ? t('boutiquesPage.durationLine', { minutes: selectedService.minutes })
                                        : undefined
                                }
                                onEdit={() => goTo('service')}
                            />
                            <SummaryRow
                                title={date ? formatReviewDate(date, i18n.language) : t('boutiquesPage.stepNavWhen')}
                                detail={timeLabel || undefined}
                                onEdit={() => goTo('when')}
                            />
                        </div>
                        {locked ? (
                            <fieldset className="flex min-w-0 flex-col gap-3 p-0">
                                <legend className="float-none mb-0 p-0 font-serif text-xl">
                                    {t('boutiquesPage.appointmentProduct')}
                                </legend>
                                <PieceCard piece={locked} />
                            </fieldset>
                        ) : null}
                    </div>
                    <fieldset className="flex min-w-0 flex-col gap-3 p-0">
                        <legend className="float-none mb-0 p-0 font-serif text-xl">
                            {t('boutiquesPage.contactDetails')}
                        </legend>
                        <Field id="appointment-name" label={t('boutiquesPage.name')}>
                            <Input id="appointment-name" name="name" required autoComplete="name" />
                        </Field>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Field id="appointment-email" label={t('boutiquesPage.email')}>
                                <Input id="appointment-email" name="email" type="email" required autoComplete="email" />
                            </Field>
                            <Field id="appointment-phone" label={t('boutiquesPage.phone')}>
                                <Input id="appointment-phone" name="phone" type="tel" autoComplete="tel" />
                            </Field>
                        </div>
                        <Field id="appointment-notes" label={t('boutiquesPage.notes')}>
                            <Textarea
                                id="appointment-notes"
                                name="notes"
                                rows={2}
                                placeholder={
                                    locked ? t('boutiquesPage.notesPlaceholder', { product: locked.name }) : undefined
                                }
                            />
                        </Field>
                    </fieldset>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <Button type="button" variant="outline" onClick={goBack}>
                            {t('boutiquesPage.back')}
                        </Button>
                        <div className="flex flex-col items-end gap-1">
                            {!date || !time ? (
                                // Editing the date on the "when" step clears the time; a shopper can
                                // then jump back here via the stepper without re-picking one. Disable
                                // Submit and say why instead of silently no-oping on click.
                                <p
                                    id="appointment-confirm-hint"
                                    role="status"
                                    className="text-xs text-muted-foreground">
                                    {t('boutiquesPage.confirmNeedsTime')}
                                </p>
                            ) : null}
                            {bookingError ? (
                                <p
                                    role="alert"
                                    data-testid="appointment-booking-error"
                                    className="text-xs text-destructive">
                                    {bookingError}
                                </p>
                            ) : null}
                            <Button
                                type="submit"
                                disabled={bookingSubmitting || !date || !time}
                                aria-describedby={!date || !time ? 'appointment-confirm-hint' : undefined}>
                                {t('boutiquesPage.submit')}
                            </Button>
                        </div>
                    </div>
                </form>
            ) : null}

            {step !== 'review' && step !== 'location' ? (
                <div className="mt-8">
                    <Button type="button" variant="outline" onClick={goBack}>
                        {t('boutiquesPage.back')}
                    </Button>
                </div>
            ) : null}
        </>
    );

    return (
        <div
            id="appointment"
            data-testid="boutique-appointment"
            data-step={step}
            className="flex h-full min-h-0 flex-1 flex-col scroll-mt-[calc(var(--header-height,72px)+1.5rem)] px-4 sm:px-6 lg:px-8 py-8">
            {step === 'location' ? (
                <div className="flex flex-col gap-6">
                    {chrome}
                    {pieceLead ? <div>{pieceLead}</div> : null}
                    <ul className="flex flex-col gap-4">
                        {stores.map((s) => (
                            <li key={s.id}>
                                <div
                                    className={cn(
                                        'border p-4',
                                        externalId === s.id ? 'border-foreground' : 'border-border'
                                    )}>
                                    <p className="font-serif text-lg">{s.name}</p>
                                    {s.address1 ? <p className="mt-1 text-sm">{s.address1}</p> : null}
                                    {s.city || s.stateCode || s.postalCode ? (
                                        <p className="text-sm text-muted-foreground">
                                            {[s.city, s.stateCode, s.postalCode].filter(Boolean).join(', ')}
                                        </p>
                                    ) : null}
                                    {s.phone ? <p className="mt-1 text-sm text-muted-foreground">{s.phone}</p> : null}
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="mt-3"
                                        onClick={() => pickBoutique(s.id)}>
                                        {t('boutiquesPage.select')}
                                    </Button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : store ? (
                <div>{stageRight}</div>
            ) : null}
        </div>
    );
}
