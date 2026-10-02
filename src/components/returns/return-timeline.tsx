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

import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getStatusSteps } from '@/lib/returns/return-store';
import type { ReturnRequest } from '@/lib/returns/types';

/**
 * Status timeline. Purely derived from the request: the current step is the last entry of the ordered steps
 * that matches `request.status`, so there is no local state to drift out of sync with the store.
 */
export function ReturnTimeline({ request }: { request: ReturnRequest }): ReactElement {
    const { t, i18n } = useTranslation('returns');
    const steps = getStatusSteps(request);
    const currentIndex = steps.indexOf(request.status);
    const reachedAt = new Map(request.history.map((entry) => [entry.status, entry.at]));

    const formatTime = (iso: string | undefined): string | null => {
        if (!iso) return null;
        const date = new Date(iso);
        // Fixed zone so the server and browser render the same text.
        return Number.isNaN(date.getTime())
            ? null
            : new Intl.DateTimeFormat(i18n.language, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: 'UTC',
              }).format(date);
    };

    return (
        <ol className="space-y-4" data-testid="return-timeline">
            {steps.map((step, index) => {
                const done = index <= currentIndex;
                const current = index === currentIndex;
                const time = formatTime(reachedAt.get(step));
                return (
                    <li key={step} className="flex items-start gap-3" aria-current={current ? 'step' : undefined}>
                        <span
                            className={cn(
                                'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs',
                                done
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-border text-muted-foreground'
                            )}
                            aria-hidden>
                            {done ? <Check className="size-3.5" /> : index + 1}
                        </span>
                        <div className="min-w-0">
                            <p
                                className={cn(
                                    'text-sm',
                                    current
                                        ? 'font-semibold text-foreground'
                                        : done
                                          ? 'text-foreground'
                                          : 'text-muted-foreground'
                                )}>
                                {t(`status.${step}`)}
                            </p>
                            {time && <p className="text-xs text-muted-foreground">{time}</p>}
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}
