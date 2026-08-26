import { a as PreloadResource } from "./index2.js";
import * as react_jsx_runtime0 from "react/jsx-runtime";

//#region src/design/react/stylesheet-precedence.d.ts

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
/** React stylesheet groups are ordered by first appearance, not by the value of these strings. */
declare const STOREFRONT_STYLESHEET_PRECEDENCE = "storefront";
declare const PAGE_DESIGNER_STYLESHEET_PRECEDENCE = "page-designer";
/**
 * Create a route link descriptor for CSS that must precede critical Page Designer styles.
 * Use this for application, route, and extension styles rendered through React Router's Links.
 */
declare function createStorefrontStylesheetLink(href: string): {
  rel: "stylesheet";
  href: string;
  precedence: string;
};
//#endregion
//#region src/design/react/preload.d.ts

interface PreloadResourcesProps {
  resources: PreloadResource[];
  /** Must match the policy of the module graph that consumes these resources. */
  crossOrigin?: 'anonymous';
}
declare function PreloadResources({
  resources,
  crossOrigin
}: PreloadResourcesProps): react_jsx_runtime0.JSX.Element[];
//#endregion
export { PAGE_DESIGNER_STYLESHEET_PRECEDENCE, PreloadResources, PreloadResourcesProps, STOREFRONT_STYLESHEET_PRECEDENCE, createStorefrontStylesheetLink };
//# sourceMappingURL=design-react-preload.d.ts.map