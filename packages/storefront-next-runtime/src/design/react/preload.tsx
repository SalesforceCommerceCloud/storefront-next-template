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

import type { PreloadResource } from '../preload';

// oxlint-disable-next-line react/only-export-components -- public React resource entry point
export * from './stylesheet-precedence';

export interface PreloadResourcesProps {
    resources: PreloadResource[];
    /** Must match the policy of the module graph that consumes these resources. */
    crossOrigin?: 'anonymous';
}

export function PreloadResources({ resources, crossOrigin = 'anonymous' }: PreloadResourcesProps) {
    return resources.map((resource) =>
        resource.kind === 'module' ? (
            <link
                key={`${resource.kind}:${resource.href}`}
                rel="modulepreload"
                href={resource.href}
                crossOrigin={crossOrigin}
            />
        ) : (
            <link key={`${resource.kind}:${resource.href}`} rel="stylesheet" href={resource.href} />
        )
    );
}
