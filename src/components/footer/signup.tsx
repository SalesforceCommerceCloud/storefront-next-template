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
import { type FormEvent, type ReactElement, useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UITarget } from '@/targets/ui-target';

export default function Signup(): ReactElement {
    const { t } = useTranslation('footer');
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = useCallback(
        (e: FormEvent) => {
            e.preventDefault();
            setError(null);
            if (inputRef.current?.value?.trim()) {
                const email = inputRef.current.value;
                // Basic email validation
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    setError(t('newsletter.invalidEmail'));
                    return;
                }
                // eslint-disable-next-line no-alert
                alert(`Signup email address: ${email}`);
            } else {
                setError(t('newsletter.emailRequired'));
            }
        },
        [inputRef, t]
    );

    return (
        <UITarget targetId="sfcc.emailSignUp.consent.marketing">
            <form onSubmit={handleSubmit} className="w-full max-w-md">
                <label htmlFor="footer-newsletter-email" className="sr-only">
                    {t('newsletter.emailLabel')}
                </label>
                <div className="flex flex-row gap-2 sm:gap-3">
                    <Input
                        ref={inputRef}
                        id="footer-newsletter-email"
                        type="email"
                        placeholder={t('newsletter.emailPlaceholder')}
                        className="flex-1 h-10 bg-background text-sm font-normal leading-5 text-muted-foreground truncate"
                        aria-describedby={error ? 'footer-newsletter-error' : undefined}
                        aria-invalid={!!error}
                    />
                    <UITarget targetId="sfcc.emailSignUp.consent.tos" />
                    <Button
                        type="submit"
                        variant="secondary"
                        size="lg"
                        className="bg-primary-foreground rounded-ui shadow-2xs">
                        {t('newsletter.subscribeButton')}
                    </Button>
                </div>
                {error && (
                    <div id="footer-newsletter-error" role="alert" className="mt-2 text-sm text-destructive">
                        {error}
                    </div>
                )}
            </form>
        </UITarget>
    );
}
