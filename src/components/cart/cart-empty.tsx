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

// React Router
import { Link } from '@/components/link';

// UI Components
import { Button } from '@/components/ui/button';
import { Typography } from '@/components/typography';

import { useTranslation } from 'react-i18next';
import { useAuth } from '@/providers/auth';
import { routes } from '@/route-paths';

/**
 * EmptyCart component that displays when the cart has no items
 *
 * @returns JSX element with empty cart display
 *
 * @see {@link CartContent} - Cart component that uses this for empty state
 */
export default function EmptyCart(): ReactElement {
    const { t } = useTranslation('cart');
    const isRegistered = useAuth()?.userType === 'registered';

    return (
        <div className="bg-muted flex-1 min-w-full w-full" data-testid="sf-cart-empty">
            <div className="section-container py-8 lg:py-14">
                <div className="bg-background p-8 md:p-16 text-center">
                    {/* Empty Cart Icon */}
                    <svg
                        className="w-24 h-24 text-muted-foreground/30 mx-auto mb-6"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true">
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                        />
                    </svg>

                    {/* Empty Cart Message */}
                    <Typography
                        variant="h2"
                        as="h2"
                        className="text-2xl text-center font-semibold text-foreground mb-2">
                        {t('empty.title')}
                    </Typography>
                    <p className="text-sm text-muted-foreground mb-8">
                        {t(isRegistered ? 'empty.registeredMessage' : 'empty.guestMessage')}
                    </p>

                    {/* Action Button */}
                    <Button asChild>
                        <Link to={routes.home}>{t('empty.continueShopping')}</Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}
