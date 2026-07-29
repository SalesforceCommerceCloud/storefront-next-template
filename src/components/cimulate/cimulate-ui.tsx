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

import { validateCimulateConfig, type CimulateConfig } from './cimulate.utils';
import { CimulateWindow } from './cimulate-window';

interface CimulateUIProps {
    cimulateConfiguration?: CimulateConfig;
}

/**
 * Cimulate UI chunk – validates config and mounts the Commerce Client widget.
 * Loaded after first paint via requestIdleCallback so it stays off the critical path.
 */
export default function CimulateUI({ cimulateConfiguration }: CimulateUIProps) {
    if (!validateCimulateConfig(cimulateConfiguration)) {
        return null;
    }

    return (
        <div data-testid="cimulate-agent">
            <CimulateWindow config={cimulateConfiguration} />
        </div>
    );
}
