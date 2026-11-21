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
import type { ComponentType, ReactElement, SVGProps } from 'react';
import { Form } from '@/components/form';
import { Button } from '@/components/ui/button';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { useTranslation } from 'react-i18next';
import { SiApple } from '@icons-pack/react-simple-icons';
import { KeyRound } from 'lucide-react';
import { GoogleIcon } from '@/components/icons';

interface SocialLoginButtonsProps {
    redirectPath?: string;
}

interface ProviderIconConfig {
    Component: ComponentType<SVGProps<SVGSVGElement>>;
    /** Tailwind classes controlling size + per-brand vertical alignment vs the label. */
    className: string;
}

const PROVIDER_ICONS: Record<string, ProviderIconConfig> = {
    // https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple
    apple: { Component: SiApple, className: 'size-4 shrink-0' },
    // https://developers.google.com/identity/branding-guidelines
    google: { Component: GoogleIcon, className: 'size-4 shrink-0 self-center' },
};

const FALLBACK_ICON: ProviderIconConfig = {
    Component: KeyRound,
    className: 'size-4 shrink-0',
};

export function SocialLoginButtons({ redirectPath }: SocialLoginButtonsProps = {}): ReactElement | null {
    const config = useConfig();
    const { t } = useTranslation('login');
    const socialIDPs: string[] = config.features.socialLogin.providers;

    // text template moved to uiStrings.login.continueWithProvider
    if (socialIDPs.length === 0) {
        return null;
    }

    return (
        <div className="space-y-3">
            <div className="relative">
                <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border/60" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">{t('socialOrContinueWith')}</span>
                </div>
            </div>

            <div className="grid gap-2">
                {socialIDPs.map((provider) => {
                    const { Component: Icon, className: iconClassName } =
                        PROVIDER_ICONS[provider.toLowerCase()] ?? FALLBACK_ICON;
                    const label = t('continueWithProvider', { provider });
                    return (
                        <Form method="post" key={provider}>
                            <input type="hidden" name="loginMode" value="social" />
                            <input type="hidden" name="provider" value={provider} />
                            {redirectPath && <input type="hidden" name="redirectPath" value={redirectPath} />}
                            <Button type="submit" variant="outline" className="flex w-full items-start">
                                <Icon className={iconClassName} aria-hidden="true" />
                                <span>{label}</span>
                            </Button>
                        </Form>
                    );
                })}
            </div>
        </div>
    );
}
