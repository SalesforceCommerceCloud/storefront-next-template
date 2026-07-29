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
import { Outlet } from 'react-router';
import { SkipLink } from '@/components/skip-link';

/**
 * Empty Layout Route
 *
 * This pathless layout route provides a minimal wrapper without header/footer.
 * Use this for routes that need a clean slate (e.g., login, callbacks).
 *
 * Routes that need this layout should be prefixed with `_empty.` in their filename.
 * For routes with the standard header/footer, use the `_app.` prefix instead.
 */
export default function EmptyLayout() {
    // `data-layout="empty"` marks this headerless layout so vertical themes can
    // opt its <main> out of header-height top padding (no header is rendered here).
    return (
        <>
            <SkipLink />
            <main id="main-content" tabIndex={-1} data-layout="empty">
                <Outlet />
            </main>
        </>
    );
}
