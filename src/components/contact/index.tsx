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
import { type ReactElement, useCallback } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Form } from 'react-router';
import { Link } from '@/components/link';
import { Typography } from '@/components/typography';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

const fieldClassName =
    'border-input bg-background text-foreground placeholder:text-muted-foreground shadow-xs h-10 px-3 py-2 text-sm leading-5';

const textAreaClassName = cn('min-h-48 resize-none text-sm leading-5');

export default function Contact(): ReactElement {
    const { t } = useTranslation('aboutUs');

    // Integrators should wire this submit handler to a contact endpoint. The current
    // implementation is a UI scaffold that displays a success toast.
    const handleSubmit = useCallback(
        (event: React.FormEvent<HTMLFormElement>) => {
            // Unstyled + semantic surface colors: Sonner richColors success fails WCAG AA (4.5:1) on light backgrounds.
            toast.success(t('contact.toast.success'), {
                duration: 5000,
                unstyled: true,
                classNames: {
                    toast: 'flex w-full max-w-md items-center gap-3 rounded-ui border border-border bg-card p-4 text-card-foreground shadow-lg',
                    title: 'text-sm font-medium text-foreground',
                    actionButton:
                        'inline-flex shrink-0 items-center justify-center rounded-ui border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-xs outline-none hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring',
                },
                action: {
                    label: 'Close',
                    onClick: () => toast.dismiss(),
                },
            });
            event.currentTarget.reset(); // Clear the form after successful submission
        },
        [t]
    );

    return (
        <Card className="max-w-screen-2xl border-0 bg-background px-0 py-6 sm:flex-row gap-12">
            <div className="flex-1 p-6">
                <div className="flex flex-col gap-1.5">
                    <Typography variant="h3" className="tracking-tight text-card-foreground">
                        {t('contact.title')}
                    </Typography>
                    <div className="text-sm leading-5 text-muted-foreground">
                        <Typography as="p" className="text-sm leading-5 text-muted-foreground">
                            {t('contact.intro')}
                            <br />
                            <Link to={t('contact.phoneHref')} className="text-primary underline">
                                {t('contact.phoneDisplay')}
                            </Link>
                        </Typography>
                        <Typography as="p" className="mt-4 text-sm leading-5 text-muted-foreground">
                            {t('contact.hours.weekdays')}
                            <br />
                            {t('contact.hours.weekends')}
                        </Typography>
                        <Typography as="p" className="mt-4 text-sm leading-5 text-muted-foreground">
                            {t('contact.cta')}
                        </Typography>
                    </div>
                </div>
            </div>
            <div className="flex flex-1 flex-col gap-4 p-6">
                <Form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="contact-full-name" className="text-sm leading-5 font-normal text-foreground">
                            {t('contact.form.nameLabel')}
                            <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id="contact-full-name"
                            name="fullName"
                            required
                            aria-required="true"
                            placeholder={t('contact.form.placeholders.fullName')}
                            className={fieldClassName}
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="contact-email" className="text-sm leading-5 font-normal text-foreground">
                            {t('contact.form.emailLabel')}
                            <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id="contact-email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            required
                            aria-required="true"
                            placeholder={t('contact.form.placeholders.email')}
                            className={fieldClassName}
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="contact-topic" className="text-sm leading-5 font-normal text-foreground">
                            {t('contact.form.label')}
                            <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id="contact-topic"
                            name="topic"
                            placeholder={t('contact.form.placeholders.topic')}
                            className={fieldClassName}
                            required
                            aria-required="true"
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="contact-message" className="text-sm leading-5 font-normal text-foreground">
                            {t('contact.form.messageLabel')}
                            <span className="text-destructive">*</span>
                        </Label>
                        <Textarea
                            id="contact-message"
                            name="message"
                            className={textAreaClassName}
                            placeholder={t('contact.form.placeholders.message')}
                            required
                            aria-required="true"
                        />
                    </div>
                    <Button type="submit" className="w-full">
                        {t('contact.form.submit')}
                    </Button>
                </Form>
            </div>
        </Card>
    );
}
