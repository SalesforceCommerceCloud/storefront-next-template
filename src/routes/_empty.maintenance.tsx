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
import { useLoaderData, useSearchParams } from 'react-router';
import type { Route } from './+types/_empty.maintenance';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { Link } from '@/components/link';
import { getLogger } from '@/lib/logger.server';
import { Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export async function loader(args: Route.LoaderArgs) {
    const logger = getLogger(args.context);
    logger.debug('MaintenancePage: loader starting');
    const config = getConfig(args.context);
    const { sharedMaintenancePage, cdnUrl, forwardedHost } = config.pages.maintenancePage;

    if (sharedMaintenancePage) {
        try {
            // Fetch content from the maintenance CDN with the required header
            logger.debug('MaintenancePage: fetching shared maintenance page from CDN', { cdnUrl });
            const response = await fetch(cdnUrl, {
                headers: {
                    'x-dw-forwarded-host': forwardedHost,
                },
            });

            if (!response.ok && response.status !== 503) {
                // Server returns text but 503 as well
                logger.warn('MaintenancePage: CDN fetch returned non-OK status', { status: response.status, cdnUrl });
                return null;
            }

            let htmlContent = await response.text();
            htmlContent = htmlContent.replace(/<\/?html[^>]*>/gi, '');
            htmlContent = htmlContent.replace('</html>', '');
            htmlContent = htmlContent.replace('<head>', '');
            htmlContent = htmlContent.replace('</head>', '');
            htmlContent = htmlContent.replace('<body>', '');
            htmlContent = htmlContent.replace('</body>', '');
            //htmlContent = htmlContent.replace(/<\/?script[^>]*>/gi, '<!--');
            //htmlContent = htmlContent.replace('</script>', '-->');
            return htmlContent;
        } catch (error) {
            logger.error('MaintenancePage: failed to fetch CDN content', { error });
        }
    }
    return null;
}

export default function MaintenancePage() {
    const { t } = useTranslation('maintenancePage');
    const htmlContent = useLoaderData<typeof loader>();
    const [searchParams] = useSearchParams();
    const returnTo = searchParams.get('returnTo') || '/';

    // If we have HTML content from the CDN, render it directly
    if (htmlContent) {
        return (
            <>
                <style>{`
                    .parent-container {
                        display: flex;
                        flex-direction: column;
                        justify-content: center; /* Vertically centers content */
                        align-items: center;     /* Horizontally centers content */
                        min-height: 100vh;       /* Vital: ensures container is full screen height */
                        margin: 0;
                    }
                `}</style>
                <div className="parent-container ">
                    {/* oxlint-disable-next-line react/no-danger */}
                    <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
                    <Link
                        to={returnTo}
                        className="mt-8 inline-block bg-primary px-12 py-3 text-base font-semibold text-primary-foreground no-underline transition-colors hover:bg-primary/90">
                        {t('tryAgain')}
                    </Link>
                </div>
            </>
        );
    }

    // Fallback maintenance page if fetch failed
    return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
            <div className="mx-auto max-w-4xl text-center">
                {/* Icon */}
                <div className="mb-12 flex justify-center">
                    <Settings className="h-20 w-20 text-foreground" strokeWidth={2} />
                </div>

                {/* Heading */}
                <h1 className="mb-8 text-5xl font-semibold tracking-tight text-foreground sm:text-6xl">
                    {t('heading')}
                </h1>

                {/* Body text */}
                <p className="mb-6 text-lg text-muted-foreground sm:text-2xl">{t('description')}</p>

                {/* Apology text */}
                <p className="mb-12 text-base text-muted-foreground sm:text-lg">{t('apology')}</p>

                {/* Footer text */}
                <p className="mb-8 text-base text-muted-foreground sm:text-lg">{t('checkBack')}</p>

                {/* Try Again button */}
                <Link
                    to={returnTo}
                    className="inline-block bg-primary px-12 py-3 text-base font-semibold text-primary-foreground no-underline transition-colors hover:bg-primary/90">
                    {t('tryAgain')}
                </Link>
            </div>
        </div>
    );
}
