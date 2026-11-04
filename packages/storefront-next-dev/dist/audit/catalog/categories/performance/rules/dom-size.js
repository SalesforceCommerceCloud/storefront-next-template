import "../../../../../har.js";
import { n as documentSizeDataSchema, r as documentSizeRule, t as count } from "../../../../../document-size.js";

//#region src/audit/catalog/categories/performance/rules/dom-size.ts
var dom_size_default = documentSizeRule({
	label: "Element count",
	budget: 1400,
	value: (size) => size.elements,
	format: count,
	evidence: (size) => size.lighthouseArtifact ? {
		artifact: size.lighthouseArtifact,
		pointer: "/audits/dom-size-insight/details/items"
	} : null,
	decideFailures: false
});

//#endregion
export { documentSizeDataSchema as dataSchema, dom_size_default as default };