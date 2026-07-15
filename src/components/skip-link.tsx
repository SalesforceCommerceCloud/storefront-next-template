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

/**
 * Skip link component that allows keyboard users to jump directly to the main content.
 * Visually hidden until focused, this should be the first focusable element on the page.
 *
 * WCAG 2.1 SC 2.4.1 Bypass Blocks (Level A)
 */
export function SkipLink() {
    const { t } = useTranslation('common');

    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
        e.preventDefault();
        const main = document.getElementById('main-content');
        if (main) {
            main.focus();
            main.scrollIntoView();
        }
    };

    return (
        <a
            href="#main-content"
            onClick={handleClick}
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-ui focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
            {t('skipToMainContent')}
        </a>
    );
}
