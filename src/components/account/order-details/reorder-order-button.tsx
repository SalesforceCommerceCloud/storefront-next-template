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
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useReorder } from '@/hooks/use-reorder';
import { accountPrimaryButtonClasses } from '@/lib/account-action-styles';

interface ReorderOrderButtonProps {
    orderNo: string;
}

export function ReorderOrderButton({ orderNo }: ReorderOrderButtonProps) {
    const { t } = useTranslation('account');
    const { reorder, isLoading } = useReorder(orderNo, 'available');

    return (
        <Button
            variant="default"
            className={`w-full ${accountPrimaryButtonClasses}`}
            onClick={reorder}
            disabled={isLoading}
            aria-busy={isLoading}>
            {isLoading ? t('orders.reorderingOrder') : t('orders.reorderThisOrder')}
        </Button>
    );
}

export default ReorderOrderButton;
