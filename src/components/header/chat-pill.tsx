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
import { Sparkle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { openAgentWidget } from '@/components/cimulate';

interface ChatPillProps {
    /** Visible label; defaults to the header "Open chat" string. */
    label?: string;
    className?: string;
}

/**
 * Header button that opens the shopper agent: a filled sparkle plus the agent name, styled like the other header icons.
 * The label is hidden below `lg`, leaving an icon button.
 */
export default function ChatPill({ label, className }: ChatPillProps): ReactElement {
    const { t } = useTranslation('header');
    const text = label || t('openChat');
    return (
        <button
            type="button"
            onClick={() => openAgentWidget()}
            aria-label={text}
            data-testid="header-chat-pill"
            className={cn(
                // Same look as the other header icons: no fill, header foreground, fade on hover.
                'inline-flex h-9 cursor-pointer items-center gap-2 px-1 lg:px-4 text-sm whitespace-nowrap',
                'text-header-foreground hover:opacity-50 transition-opacity',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                className
            )}>
            <Sparkle className="size-5 shrink-0" fill="currentColor" aria-hidden />
            <span className="hidden lg:inline">{text}</span>
        </button>
    );
}
