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
import { ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from '@/components/link';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import LegalLinks from '@/components/footer/legal-links';
import Signup from './signup';
import SocialIcons from './social-icons';
import Switchers from './switchers';

interface FooterLink {
    label: string;
    to: string;
}

interface FooterColumn {
    id: string;
    heading: string;
    links: FooterLink[];
}

function FooterColumnLinks({ column }: { column: FooterColumn }): ReactElement {
    const { heading } = column;
    return (
        <nav aria-label={heading}>
            <h2 className="mb-4 text-sm font-semibold text-foreground">{heading}</h2>
            <ul className="space-y-3 text-sm font-normal leading-5">
                {column.links.map((link) => (
                    <li key={link.to}>
                        <Link to={link.to} className="text-footer-foreground hover:underline">
                            {link.label}
                        </Link>
                    </li>
                ))}
            </ul>
        </nav>
    );
}

/**
 * Site footer: an inline "Get Email Updates" sign-up, then a shaded band with link columns, social icons and
 * a back-to-top button, then the language / currency switchers and the legal row.
 */
export default function MainFooter(): ReactElement {
    const { t } = useTranslation('footer');
    const { t: tGuestOrderLookup } = useTranslation('guestOrderLookup');
    const config = useConfig();
    const guestLookupEnabled = Boolean(config.guestOrderLookup?.enabled);

    const columns: FooterColumn[] = [
        {
            id: 'customerSupport',
            heading: t('sections.customerSupport'),
            links: [
                { label: t('links.contactUs'), to: '/contact-us' },
                {
                    label: guestLookupEnabled ? tGuestOrderLookup('footerLinkLabel') : t('links.orderStatus'),
                    to: guestLookupEnabled ? '/order-lookup' : '/account/orders',
                },
                { label: t('links.shipping'), to: '/shipping' },
                { label: t('links.returns'), to: '/returns' },
                { label: t('links.faq'), to: '/faq' },
            ],
        },
        {
            id: 'account',
            heading: t('sections.account'),
            links: [
                { label: t('links.signInOrCreateAccount'), to: '/account' },
                { label: t('links.wishlist'), to: '/account/wishlist' },
            ],
        },
        {
            id: 'ourCompany',
            heading: t('sections.ourCompany'),
            links: [
                { label: t('links.aboutUs'), to: '/about-us' },
                { label: t('links.careers'), to: '/careers' },
                { label: t('links.accessibility'), to: '/accessibility' },
            ],
        },
    ];

    return (
        <footer className="mt-auto">
            <div className="section-container flex justify-center py-6 sm:justify-end">
                <Signup inline />
            </div>

            <div className="bg-footer-background text-footer-foreground">
                <div className="section-container py-10">
                    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
                        {columns.map((column) => (
                            <FooterColumnLinks key={column.id} column={column} />
                        ))}

                        <div className="flex flex-col gap-6 lg:items-end">
                            <SocialIcons />
                            <button
                                type="button"
                                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                                className="flex cursor-pointer flex-col items-center rounded-ui bg-background px-3 py-2 text-xs text-foreground shadow-ui">
                                <ChevronUp className="size-5" aria-hidden />
                                {t('backToTop')}
                            </button>
                        </div>
                    </div>

                    {/* Language and currency */}
                    <div className="mt-10">
                        <Switchers />
                    </div>

                    <div className="mt-10 flex flex-col gap-3 text-sm font-normal leading-5 text-muted-foreground xl:flex-row xl:items-center xl:gap-8">
                        <LegalLinks className="gap-x-8" />
                        <Link to="/privacy-choices" className="hover:text-foreground transition-colors">
                            {t('links.privacyChoices')}
                        </Link>
                        <div>
                            © {new Date().getFullYear()} {t('copyright')}
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
}
