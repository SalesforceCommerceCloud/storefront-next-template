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
import { Heart } from 'lucide-react';
import { Link } from '@/components/link';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth';
import { useTranslation } from 'react-i18next';

export default function WishlistIcon(): ReactElement {
    const session = useAuth();
    const { t } = useTranslation('header');
    // Gate on userType only — under a cached app shell the client restores userType from the
    // `__sfdc_usertype` hint cookie, but customerId is never carried in that hint. userType is
    // authoritative ('registered' iff the JWT carried a registered-customer id).
    const isAuthenticated = session?.userType === 'registered';
    const wishlistLink = isAuthenticated ? '/account/wishlist' : '/wishlist';

    return (
        <Button
            variant="ghost"
            // Icon-only trigger. The Button size default sets `has-[>svg]:px-3` (12px) for icon
            // children, in the same tailwind-merge group as the compact padding here, so a bare
            // `px-1` would be dead code. Use the `has-[>svg]:` modifier so the compact mobile
            // padding wins; without it the header row overflows a 320px viewport and the mobile
            // menu button is pushed off-screen (WCAG 1.4.10 Reflow).
            className="cursor-pointer lg:has-[>svg]:px-4 has-[>svg]:px-1 hover:bg-transparent hover:opacity-50 transition-opacity"
            asChild>
            <Link to={wishlistLink} aria-label={t('wishlist')}>
                <Heart className="size-5" />
            </Link>
        </Button>
    );
}
