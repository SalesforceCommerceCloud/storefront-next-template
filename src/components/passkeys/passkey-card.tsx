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
import { useTranslation } from 'react-i18next';
import { Fingerprint, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ShopperLogin } from '@/scapi';

export type PasskeyCredential = ShopperLogin.schemas['PasskeyCredential'];

export interface PasskeyCardProps {
    credential: PasskeyCredential;
    onRemove?: () => void;
    /** Whether this credential was registered during the current session (cleared on reload). */
    isNew?: boolean;
}

function formatTimestamp(value: string | undefined, locale: string): string | undefined {
    if (!value) return undefined;
    const date = new Date(value);
    if (isNaN(date.getTime())) return undefined;
    return date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Passkey credential card displaying its nickname, created/last-used dates, usage count,
 * and a delete action.
 */
export function PasskeyCard({ credential, onRemove, isNew = false }: PasskeyCardProps): ReactElement {
    const { t, i18n } = useTranslation('account');
    const displayName = credential.nickName || t('passkeys.unnamedPasskey');
    const createdOn = formatTimestamp(credential.createdTime, i18n.language);
    const lastUsedOn = formatTimestamp(credential.lastUsed, i18n.language);
    const uses = credential.uses ?? 0;

    return (
        <Card className="p-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Fingerprint className="w-5 h-5 text-muted-foreground flex-shrink-0" aria-hidden="true" />
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-base font-medium text-foreground">{displayName}</span>
                            {isNew && (
                                <Badge variant="secondary" className="text-xs font-normal">
                                    {t('passkeys.newBadge')}
                                </Badge>
                            )}
                        </div>
                        {createdOn && (
                            <p className="text-sm text-muted-foreground">
                                {t('passkeys.addedOn', { date: createdOn })}
                            </p>
                        )}
                        <p className="text-sm text-muted-foreground">
                            {lastUsedOn ? t('passkeys.lastUsed', { date: lastUsedOn }) : t('passkeys.notUsedYet')}
                        </p>
                        <p className="text-sm text-muted-foreground">{t('passkeys.uses', { count: uses })}</p>
                    </div>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onRemove}
                    aria-label={t('passkeys.deletePasskeyAriaLabel', { name: displayName })}>
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                </Button>
            </div>
        </Card>
    );
}
