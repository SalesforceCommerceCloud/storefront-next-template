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
import { Scripts as ReactRouterScripts } from 'react-router';
import { getBasePath } from '../utils/paths';
import { getClientBundlePath } from '@salesforce/storefront-next-runtime/assets';

/**
 * Determines if the code is running in a server-side rendering (SSR) environment.
 * Returns true when window is undefined (server), false otherwise (client).
 */
const isSSR = typeof window === 'undefined';

/**
 * Internal component that injects bundle configuration scripts during server-side rendering.
 *
 * This component renders a script tag that sets up global bundle variables on the window object,
 * which are used by the client-side application to locate and load the correct bundle assets.
 *
 * The script defines:
 * - `window._BUNDLE_ID`: The unique identifier for the current bundle (from BUNDLE_ID env var, defaults to 'local')
 * - `window._BUNDLE_PATH`: The path to the client bundle assets (e.g., `/mobify/bundle/{bundleId}/client/`)
 *
 * @returns A script element during SSR, or null during client-side rendering
 * @internal
 */
const InternalServerScripts = ({ nonce }: { nonce?: string }) => {
    if (!isSSR) {
        return null;
    }

    const bundleId = process.env.BUNDLE_ID || 'local';
    const basePath = getBasePath();
    const bundlePath = getClientBundlePath();
    return (
        <script
            id="sf-next-bundle-config"
            nonce={nonce}
            // oxlint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{
                __html: `
        window._BUNDLE_ID = ${JSON.stringify(bundleId)};
        window._BUNDLE_PATH = ${JSON.stringify(bundlePath)};
        window._BASE_PATH = ${JSON.stringify(basePath)};
    `,
            }}
        />
    );
};

/**
 * Enhanced Scripts component that wraps React Router's Scripts component with Storefront Next-specific functionality.
 *
 * This component extends the standard React Router Scripts component by injecting additional
 * bundle configuration scripts during server-side rendering. It ensures that bundle metadata
 * (ID and path) are available on the client before any other scripts execute.
 *
 * @private This is an internal SDK component — do not import directly.
 * It is automatically applied via the `patchReactRouter` Vite plugin at build time.
 * Customers should use `Scripts` from `react-router` as normal; the plugin transparently
 * substitutes this enhanced version in production builds.
 *
 * @param props - Props passed through to the underlying React Router Scripts component
 * @returns A fragment containing internal bundle scripts and React Router scripts
 */
export function Scripts(props: React.ComponentProps<typeof ReactRouterScripts>) {
    return (
        <>
            <InternalServerScripts nonce={props.nonce} />
            <ReactRouterScripts {...props} />
        </>
    );
}
