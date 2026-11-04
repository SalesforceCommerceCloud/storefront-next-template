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
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import standardSprite from '@salesforce-ux/design-system/assets/icons/standard-sprite/svg/symbols.svg?url';
import utilitySprite from '@salesforce-ux/design-system/assets/icons/utility-sprite/svg/symbols.svg?url';
import { IconSettings } from './lib/slds';
import { App } from './App';
import '@salesforce-ux/design-system/assets/styles/salesforce-lightning-design-system.css';
import './styles/tokens.css';
import './styles/app.css';

// Icon sprites are bundled assets served by the same Hono server as the app,
// so <use href> references stay same-origin and work offline.
const root = document.getElementById('root');
if (!root) throw new Error('The dashboard page has no #root element');
createRoot(root).render(
    <StrictMode>
        <IconSettings standardSprite={standardSprite} utilitySprite={utilitySprite}>
            <App />
        </IconSettings>
    </StrictMode>
);
