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
import { Button } from '@/components/ui/button';
import { useReturnInProgress } from '@/hooks/use-returns';
import { routes, routeHref } from '@/route-paths';

/**
 * Hidden while a return for the order is in progress (the badge links to it instead). Also hidden until the browser
 * store has been read, so the server HTML and the first client render match and the button never flashes in and out.
 */
export function ReturnOrExchangeButton({
    orderNo,
    className,
}: {
    orderNo: string;
    className?: string;
}): ReactElement | null {
    const { t } = useTranslation('returns');
    const { ready, inProgress } = useReturnInProgress(orderNo);
    if (!ready || inProgress) return null;
    return (
        <Button asChild variant="outline" size="sm" className={className} data-testid="return-or-exchange-button">
            <Link to={routeHref(routes.accountOrderReturn, { orderNo })}>{t('actions.returnOrExchange')}</Link>
        </Button>
    );
}
