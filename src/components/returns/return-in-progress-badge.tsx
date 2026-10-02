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
import { Link } from '@/components/link';
import { Badge } from '@/components/ui/badge';
import { useOrderReturns } from '@/hooks/use-returns';
import { isFinalStatus } from '@/lib/returns/return-status';
import { routes, routeHref } from '@/route-paths';

/**
 * Badge on an order that links to its return. It says "Return in progress" while a return is open, and the final
 * status (Refunded, Exchange shipped) once it has finished. With several returns, an open one wins, else the latest.
 * Renders nothing until the browser store has been read (server and hydration render), so it never causes a
 * hydration mismatch.
 */
export function ReturnInProgressBadge({ orderNo }: { orderNo: string }): ReactElement | null {
    const { t } = useTranslation('returns');
    const { ready, requests } = useOrderReturns(orderNo);
    const request = requests.find((candidate) => !isFinalStatus(candidate)) ?? requests[requests.length - 1];
    if (!ready || !request) return null;

    const finished = isFinalStatus(request);
    return (
        <Badge asChild variant={finished ? 'outline' : 'info'} data-testid="return-in-progress-badge">
            <Link to={routeHref(routes.accountReturnDetail, { rmaNo: request.rmaNo })}>
                {finished ? t(`status.${request.status}`) : t('actions.inProgress')}
            </Link>
        </Badge>
    );
}
