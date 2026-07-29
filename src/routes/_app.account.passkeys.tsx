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
import { type ReactElement } from 'react';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import type { Route } from './+types/_app.account.passkeys';
import { useTranslation } from 'react-i18next';
import { getPasskeyList } from '@/middlewares/auth.server';
import { PasskeysManagement, type PasskeyCredential } from '@/components/passkeys';
import { SeoMeta } from '@/components/seo-meta';

type AccountPasskeysPageData = {
    credentials: Promise<PasskeyCredential[]>;
};

/**
 * Server-side loader for the account passkeys page. Credentials are non-critical
 * (below-the-fold list content) so the promise is returned unresolved for deferred rendering.
 *
 * When the passkey feature is disabled the root omits `PasskeyRegistrationProvider`, so
 * rendering `PasskeysManagement` (which calls that provider's context hook) would throw.
 * Return a 404 for a direct/stale URL instead — the nav links are already hidden when disabled.
 */
export function loader({ context }: Route.LoaderArgs): AccountPasskeysPageData {
    if (!getConfig(context).features?.passkey?.enabled) {
        throw new Response('Not Found', { status: 404 });
    }
    return { credentials: getPasskeyList(context) };
}

/**
 * Account passkeys management page route.
 *
 * The credentials list is deferred inside `PasskeysManagement`, which renders the page chrome
 * synchronously and suspends only the list. That keeps the heading and "Add Passkey" button
 * visible even while the list is loading — or if the passkey lookup fails, in which case an
 * inline error replaces just the list rather than the whole page.
 */
export default function AccountPasskeysRoute({ loaderData }: Route.ComponentProps): ReactElement {
    const { t } = useTranslation('account');
    const { credentials } = loaderData;

    return (
        <>
            <SeoMeta title={t('passkeys.pageTitle')} noIndex />
            <PasskeysManagement credentials={credentials} />
        </>
    );
}
