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
import type { HtmlContentType } from './types';
import { HTML_CONTENT_STYLES } from './styles';
import { transformHtmlImageUrls } from '@/lib/images/dynamic-image';
import { useConfig } from '@salesforce/storefront-next-runtime/config';

interface HtmlFragmentProps {
    /** The HTML or plain text content to render */
    content: string;
    /** Declares the expected HTML structure, used to resolve default styling */
    contentType?: HtmlContentType;
    /** CSS class override — takes precedence over contentType-based styling */
    className?: string;
}

/**
 * Renders HTML or plain text content via dangerouslySetInnerHTML.
 * SSR-safe — no browser-only APIs are used.
 * Resolves default styling from HTML_CONTENT_STYLES based on contentType.
 * Automatically transforms image URLs to use DIS with WebP optimization.
 */
export default function HtmlFragment({
    content,
    contentType = 'plain-text',
    className,
}: HtmlFragmentProps): ReactElement {
    const config = useConfig();

    // Transform any image URLs in the HTML content to use DIS with WebP optimization
    const transformedContent = transformHtmlImageUrls(content, config);

    return (
        <div
            data-testid="html-fragment"
            className={className ?? HTML_CONTENT_STYLES[contentType]}
            // oxlint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: transformedContent }}
        />
    );
}
