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
import { usePageDesignerMode } from '@salesforce/storefront-next-runtime/design/react/core';
import { Component } from '@/lib/decorators/component';
import { AttributeDefinition } from '@/lib/decorators/attribute-definition';
import { RegionDefinition } from '@/lib/decorators';
import { Link } from '@/components/link';
import { cn } from '@/lib/utils';

const HEIGHT_VALUES = ['sm', 'md', 'lg'] as const;
type AnnouncementBannerHeight = (typeof HEIGHT_VALUES)[number];

const HEIGHT_CLASS: Record<AnnouncementBannerHeight, string> = {
    sm: 'py-1.5 text-xs',
    md: 'py-3 text-sm',
    lg: 'py-5 text-base',
};

function normalizeHeight(value: string | undefined): AnnouncementBannerHeight {
    if (value && (HEIGHT_VALUES as readonly string[]).includes(value)) {
        return value as AnnouncementBannerHeight;
    }
    return 'md';
}

const ALIGNMENT_VALUES = ['left', 'center', 'right'] as const;
type AnnouncementBannerAlignment = (typeof ALIGNMENT_VALUES)[number];

const ALIGNMENT_JUSTIFY_CLASS: Record<AnnouncementBannerAlignment, string> = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
};

const ALIGNMENT_TEXT_CLASS: Record<AnnouncementBannerAlignment, string> = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
};

function normalizeAlignment(value: string | undefined): AnnouncementBannerAlignment {
    if (value && (ALIGNMENT_VALUES as readonly string[]).includes(value)) {
        return value as AnnouncementBannerAlignment;
    }
    return 'center';
}

const COLOR_SCHEME_VALUES = ['primary', 'secondary', 'destructive'] as const;
type AnnouncementBannerColorScheme = (typeof COLOR_SCHEME_VALUES)[number];

const COLOR_SCHEME_CLASS: Record<AnnouncementBannerColorScheme, string> = {
    primary: 'bg-primary text-primary-foreground',
    secondary: 'bg-secondary text-secondary-foreground',
    destructive: 'bg-destructive text-white',
};

function normalizeColorScheme(value: string | undefined): AnnouncementBannerColorScheme {
    if (value && (COLOR_SCHEME_VALUES as readonly string[]).includes(value)) {
        return value as AnnouncementBannerColorScheme;
    }
    return 'primary';
}

@Component('announcementBanner', {
    name: 'Announcement Banner',
    group: 'Content',
    description: 'A banner for announcements, promotions, and alerts',
})
@RegionDefinition([])
// oxlint-disable-next-line react/only-export-components -- oxlint flags the co-exported Page Designer metadata class; eslint-plugin-react-refresh does not
export class AnnouncementBannerMetadata {
    @AttributeDefinition({ name: 'Message', type: 'string' })
    message!: string;

    @AttributeDefinition({ name: 'Link URL', type: 'url', required: false })
    linkUrl?: string;

    @AttributeDefinition({ name: 'Link Text', type: 'string', required: false })
    linkText?: string;

    @AttributeDefinition({
        id: 'colorScheme',
        name: 'Color Scheme',
        description: 'Token-based color treatment (uses theme tokens for guaranteed contrast)',
        type: 'enum',
        values: ['primary', 'secondary', 'destructive'],
        defaultValue: 'primary',
    })
    colorScheme?: string;

    @AttributeDefinition({
        id: 'height',
        name: 'Height',
        description: 'Vertical density of the banner',
        type: 'enum',
        values: ['sm', 'md', 'lg'],
        defaultValue: 'md',
    })
    height?: string;

    @AttributeDefinition({
        id: 'alignment',
        name: 'Alignment',
        description: 'Horizontal alignment of the message',
        type: 'enum',
        values: ['left', 'center', 'right'],
        defaultValue: 'center',
    })
    alignment?: string;
}

interface AnnouncementBannerProps {
    message: string;
    linkUrl?: string;
    linkText?: string;
    colorScheme?: string;
    height?: string;
    alignment?: string;
    className?: string;
}

export default function AnnouncementBanner({
    message,
    linkUrl,
    linkText,
    colorScheme,
    height,
    alignment,
    className,
}: AnnouncementBannerProps) {
    const { t } = useTranslation('common');
    const { isDesignMode } = usePageDesignerMode();

    // Empty state (W-23729792): a freshly-dropped Announcement Banner with no configured message.
    // It renders exactly like a real default-configured banner — the declared defaults: Primary
    // color scheme, Md height, and Center alignment (see AnnouncementBannerMetadata.alignment /
    // normalizeAlignment) — with the placeholder message "Add your text here" and no other
    // properties set (no link/CTA, no decorative art). Matching the real default keeps the banner
    // from shifting alignment the moment an author types a message. This is a Page-Designer
    // *authoring* affordance, so it renders only in design mode; on the live storefront an
    // unconfigured banner still renders nothing. Mirrors the Content Card's design-mode gate.
    const isUnconfigured = !message?.trim();
    const showEmptyState = isUnconfigured && isDesignMode;

    if (isUnconfigured) {
        if (!showEmptyState) return null;

        // Same shell as the live banner's default (md/center/primary) with placeholder copy, so the
        // authoring preview matches what a shopper will see once a message is typed. Uses theme
        // tokens only (bg-primary / text-primary-foreground) — no hardcoded colors.
        return (
            <div
                role="status"
                data-slot="empty-state"
                className={cn(
                    'relative flex items-center gap-2 px-4 md:px-10 tracking-wide',
                    ALIGNMENT_JUSTIFY_CLASS.center,
                    COLOR_SCHEME_CLASS.primary,
                    HEIGHT_CLASS.md,
                    className
                )}>
                {/*
                 * Full opacity: the placeholder previews a real default banner (per the Figma
                 * spec), and text-primary-foreground on bg-primary is tuned for AA contrast in
                 * every theme. `opacity-60` would alpha-blend the text toward the background and
                 * drop it below the WCAG AA ratio for normal text.
                 */}
                <p className={ALIGNMENT_TEXT_CLASS.center}>{t('announcementBanner.emptyTitle')}</p>
            </div>
        );
    }

    const heightClass = HEIGHT_CLASS[normalizeHeight(height)];
    const resolvedAlignment = normalizeAlignment(alignment);
    const justifyClass = ALIGNMENT_JUSTIFY_CLASS[resolvedAlignment];
    const textAlignClass = ALIGNMENT_TEXT_CLASS[resolvedAlignment];
    const colorClass = COLOR_SCHEME_CLASS[normalizeColorScheme(colorScheme)];

    return (
        <div
            role="status"
            className={cn(
                'relative flex items-center gap-2 px-4 md:px-10 tracking-wide',
                justifyClass,
                colorClass,
                heightClass,
                className
            )}>
            <p className={textAlignClass}>
                {message}
                {linkUrl && linkText && (
                    <>
                        {' '}
                        <Link to={linkUrl} className="underline font-medium whitespace-nowrap">
                            {linkText}
                        </Link>
                    </>
                )}
            </p>
        </div>
    );
}

// Mirrors the real banner's default md/center/primary classes so the reserved height matches
// the rendered banner exactly — switching from fallback to real content does not shift layout.
export function AnnouncementBannerFallback() {
    return (
        <div
            aria-hidden="true"
            className="relative flex items-center gap-2 px-4 md:px-10 tracking-wide justify-center bg-primary text-primary-foreground py-3 text-sm animate-pulse">
            <div className="h-4 w-48 rounded-ui bg-primary-foreground/20" />
        </div>
    );
}

// oxlint-disable-next-line react-refresh/only-export-components
export { AnnouncementBannerFallback as fallback };
