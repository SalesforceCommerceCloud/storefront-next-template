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
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { SparklesIcon } from '@/components/icons';
import { openAgentWidget, isCimulateEnabled, validateCimulateConfig } from '@/components/cimulate';
import { useConfig } from '@salesforce/storefront-next-runtime/config';

/**
 * Account Help component
 *
 * Always shows the Need Help card with Contact info and Browse FAQ. The primary **Ask a question**
 * control (opens Cimulate widget) only renders when cimulate agent config is valid and enabled.
 */
export function AccountHelp(): ReactElement {
    const { t } = useTranslation('account');
    const config = useConfig();

    const showAskQuestionButton =
        isCimulateEnabled(config.cimulateAgent?.enabled) && validateCimulateConfig(config.cimulateAgent);

    const handleAskQuestion = () => {
        openAgentWidget();
    };

    return (
        <Card className="py-0">
            <CardContent className="p-6">
                <h2 className="text-lg font-semibold text-foreground mb-2">{t('shopperAgentEntry.title')}</h2>
                <p className="text-sm text-muted-foreground mb-4">{t('shopperAgentEntry.description')}</p>
                <div className="flex flex-wrap gap-3">
                    {showAskQuestionButton ? (
                        <Button
                            onClick={handleAskQuestion}
                            variant="default"
                            className="flex items-center gap-2 cursor-pointer">
                            <SparklesIcon className="h-4 w-4" />
                            {t('shopperAgentEntry.askQuestion')}
                        </Button>
                    ) : null}
                    <Button variant="outline" className="flex items-center gap-2 cursor-pointer">
                        {t('shopperAgentEntry.contactInfo')}
                    </Button>
                    <Button variant="outline" className="flex items-center gap-2 cursor-pointer">
                        {t('shopperAgentEntry.browseFaq')}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

export default AccountHelp;
