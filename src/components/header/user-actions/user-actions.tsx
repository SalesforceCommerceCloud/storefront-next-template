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
import { type ReactElement, useMemo } from 'react';
import { Link } from '@/components/link';
import { User, LogIn } from 'lucide-react';
import { useAuth } from '@/providers/auth';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { UserMenu } from './user-menu';

export default function UserActions(): ReactElement {
    const session = useAuth();
    const { t } = useTranslation('header');
    const { t: tAccount } = useTranslation('account');
    const isAuthenticated: boolean = useMemo(() => {
        // Gate on userType only. Under a cached app shell the client restores userType from the
        // `__sfdc_usertype` hint cookie, but customerId is never carried in that hint — gating on it
        // too would wrongly keep a genuinely-registered visitor on the guest branch. userType is
        // authoritative: it is 'registered' iff the JWT carried a registered-customer id.
        return session?.userType === 'registered';
    }, [session]);

    const accountLink = isAuthenticated ? '/account/overview' : '/login';
    const ariaLabel = isAuthenticated ? tAccount('myAccount') : t('signIn');
    const icon = isAuthenticated ? <User className="size-5" /> : <LogIn className="size-5" />;

    const trigger = (
        <Button
            variant="ghost"
            className="cursor-pointer lg:px-4 px-1 hover:bg-transparent hover:opacity-50 transition-opacity"
            asChild>
            <Link to={accountLink} aria-label={ariaLabel}>
                {icon}
            </Link>
        </Button>
    );

    return <UserMenu isAuthenticated={isAuthenticated} trigger={trigger} />;
}
