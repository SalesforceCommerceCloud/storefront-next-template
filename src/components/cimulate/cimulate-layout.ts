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

/** Keeps storefront search suggestions above the widget and dims the content beneath the header. */
const STYLE_ATTR = 'data-cimulate-search-overlay';

export const SEARCH_OVERLAY_CSS = `
body:has(header input[role="combobox"][aria-expanded="true"]) .commerce-client-shopper-agent.cim-widget-dialog,
body:has(header input[role="combobox"][aria-expanded="true"]) .commerce-client-shopper-agent.cim-widget-minimized-container {
  z-index: 40 !important;
}
body::after {
  content: ''; position: fixed; inset: 0; z-index: 45;
  background-color: rgba(0, 0, 0, 0.25); opacity: 0; visibility: hidden; pointer-events: none;
  transition: opacity 0.15s ease-out, visibility 0.15s;
}
body:has(header input[role="combobox"][aria-expanded="true"])::after { opacity: 1; visibility: visible; }
@media (prefers-reduced-motion: reduce) {
  body::after { transition: none; }
}`;

/** Installs only storefront search layering; the widget owns its theme styles. */
export function startSearchOverlay(): () => void {
    if (typeof document === 'undefined') return () => undefined;
    const style = document.createElement('style');
    style.setAttribute(STYLE_ATTR, '');
    style.textContent = SEARCH_OVERLAY_CSS;
    document.head.appendChild(style);
    return () => style.remove();
}
