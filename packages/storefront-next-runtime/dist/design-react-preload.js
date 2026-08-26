import { jsx } from "react/jsx-runtime";

//#region src/design/react/stylesheet-precedence.ts
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
const STOREFRONT_STYLESHEET_PRECEDENCE = "storefront";
const PAGE_DESIGNER_STYLESHEET_PRECEDENCE = "page-designer";
/**
* Create a route link descriptor for CSS that must precede critical Page Designer styles.
* Use this for application, route, and extension styles rendered through React Router's Links.
*/
function createStorefrontStylesheetLink(href) {
	return {
		rel: "stylesheet",
		href,
		precedence: STOREFRONT_STYLESHEET_PRECEDENCE
	};
}

//#endregion
//#region src/design/react/preload.tsx
function PreloadResources({ resources, crossOrigin = "anonymous" }) {
	return resources.map((resource) => resource.kind === "module" ? /* @__PURE__ */ jsx("link", {
		rel: "modulepreload",
		href: resource.href,
		crossOrigin
	}, `${resource.kind}:${resource.href}`) : /* @__PURE__ */ jsx("link", {
		rel: "stylesheet",
		href: resource.href
	}, `${resource.kind}:${resource.href}`));
}

//#endregion
export { PAGE_DESIGNER_STYLESHEET_PRECEDENCE, PreloadResources, STOREFRONT_STYLESHEET_PRECEDENCE, createStorefrontStylesheetLink };
//# sourceMappingURL=design-react-preload.js.map