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
import { Card, CardContent } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import { Typography } from '@/components/typography';
import appStoreBadge from '/images/app-store-badge.svg';
import googlePlayBadge from '/images/google-play-badge.svg';

/**
 * App Download Section component
 *
 * Displays app download options with:
 * - Title and description
 * - Official Apple App Store and Google Play Store badges (mock, non-functional)
 * - QR code placeholder
 *
 * Note: Uses official badge artwork per Apple and Google trademark requirements.
 * Badges are display-only until actual app store URLs are available.
 */
export function AppDownloadSection(): ReactElement {
    const { t } = useTranslation('account');

    return (
        <Card className="py-0">
            <CardContent className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                    {/* Left side: Text and buttons */}
                    <div className="flex-1">
                        <Typography variant="h2" as="h2" className="text-lg font-semibold text-foreground mb-2">
                            {t('overview.appDownload.title')}
                        </Typography>
                        <p className="text-sm text-muted-foreground mb-6">{t('overview.appDownload.description')}</p>
                        <div className="flex flex-wrap gap-3 items-center">
                            {/* App Store Badge - Official artwork per Apple brand guidelines (display only) */}
                            <img
                                src={appStoreBadge}
                                alt={t('overview.appDownload.appStore')}
                                className="h-10 w-auto"
                                aria-label={t('overview.appDownload.appStore')}
                            />

                            {/* Google Play Badge - Official artwork per Google brand guidelines (display only) */}
                            <img
                                src={googlePlayBadge}
                                alt={t('overview.appDownload.googlePlay')}
                                className="h-10 w-auto"
                                aria-label={t('overview.appDownload.googlePlay')}
                            />
                        </div>
                    </div>

                    {/* Right side: QR code */}
                    <div className="flex flex-col items-center gap-2 lg:flex-shrink-0">
                        <div className="w-32 h-32 bg-muted flex items-center justify-center border-2 border-dashed border-border">
                            <svg
                                className="w-16 h-16 text-muted-foreground"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                role="img"
                                aria-label={t('overview.appDownload.qrCode')}>
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                                />
                            </svg>
                        </div>
                        <p className="text-sm text-muted-foreground">{t('overview.appDownload.qrCode')}</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export default AppDownloadSection;
