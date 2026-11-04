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
import { Alert, GlobalNavigationBar, GlobalNavigationBarLink, GlobalNavigationBarRegion, Icon } from '../lib/slds';

/** Google Form where customers send feedback on the preview. */
export const FEEDBACK_URL = 'https://forms.gle/kJtg4Tfudxvqykri7';

export interface NavItem {
    id: string;
    label: string;
    count?: number;
}

/**
 * Lightning app frame: the context bar (app name + section navigation) above a
 * padded canvas. Both the live run and the finished dashboard render in it so
 * moving from one to the other never changes the chrome. The preview notice
 * and the feedback link stay on every screen until the tool reaches a stable
 * release.
 */
export function AppShell({
    nav = [],
    active,
    onNavigate,
    banner,
    children,
}: {
    nav?: NavItem[];
    active?: string;
    onNavigate?: (id: string) => void;
    banner?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="audit-app">
            {banner}
            <Alert
                variant="info"
                icon={<Icon category="utility" name="info" />}
                labels={{
                    heading: 'Site Audit is in preview and under active development. Features and results may change.',
                }}
            />
            <GlobalNavigationBar>
                <GlobalNavigationBarRegion region="primary">
                    <div className="slds-context-bar__item slds-context-bar__dropdown-trigger slds-no-hover">
                        <div className="slds-context-bar__icon-action">
                            <Icon category="standard" name="dashboard" size="small" assistiveText={{ label: '' }} />
                        </div>
                        <span className="slds-context-bar__label-action slds-context-bar__app-name">
                            <span className="slds-truncate">Site Audit</span>
                        </span>
                    </div>
                </GlobalNavigationBarRegion>
                {nav.length ? (
                    <GlobalNavigationBarRegion region="secondary" navigation>
                        {nav.map((item) => (
                            <GlobalNavigationBarLink
                                key={item.id}
                                id={`nav-${item.id}`}
                                href={`#${item.id}`}
                                label={item.count === undefined ? item.label : `${item.label} (${item.count})`}
                                active={item.id === active}
                                onClick={() => onNavigate?.(item.id)}
                            />
                        ))}
                    </GlobalNavigationBarRegion>
                ) : null}
                <GlobalNavigationBarRegion region="tertiary">
                    <div className="slds-context-bar__item slds-no-hover audit-feedback">
                        <a
                            className="slds-button slds-button_neutral"
                            href={FEEDBACK_URL}
                            target="_blank"
                            rel="noreferrer">
                            <Icon
                                category="utility"
                                name="comments"
                                size="xx-small"
                                className="slds-button__icon slds-button__icon_left"
                            />
                            Give feedback
                            <span className="slds-assistive-text">(opens in a new tab)</span>
                        </a>
                    </div>
                </GlobalNavigationBarRegion>
            </GlobalNavigationBar>
            <div className="audit-page">{children}</div>
        </div>
    );
}
