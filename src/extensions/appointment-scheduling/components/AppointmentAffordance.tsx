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
import type { ReactElement } from 'react';
import { useRouteLoaderData } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Link } from '@/components/link';

type RootLoaderData = {
    appConfig?: { features?: { appointment?: { enabled?: boolean } } };
};

export default function AppointmentAffordance({ productId }: { productId?: string }): ReactElement | null {
    const { t } = useTranslation('extAppointmentScheduling');
    const rootData = useRouteLoaderData<RootLoaderData>('root');

    if (!rootData?.appConfig?.features?.appointment?.enabled) return null;

    const to = productId ? `/appointments?product=${encodeURIComponent(productId)}` : `/appointments`;

    return (
        <Link to={to} className="hover:text-foreground transition-colors">
            {t('scheduler.pageTitle')}
        </Link>
    );
}
