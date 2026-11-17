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
import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/toast';

/** A notification cookie carries no identity or basket data and authorizes nothing. */
export function BasketHandoffWarning() {
    const { site } = useSite();
    const config = useConfig();
    const location = useLocation();
    const { t } = useTranslation('cart');
    const { addToast } = useToast();
    useEffect(() => {
        const name = `basket-handoff_${site.id}`;
        if (!document.cookie.split(';').some((cookie) => cookie.trim().startsWith(`${name}=`))) return;
        const domain = site.cookies?.domain || config.cookies?.domain;
        document.cookie = `${name}=; Max-Age=0; Path=/${domain ? `; Domain=${domain}` : ''}`;
        addToast(t('handoffWarning'), 'info');
    }, [location.key, site.id, site.cookies?.domain, config.cookies?.domain, addToast, t]);
    return null;
}
