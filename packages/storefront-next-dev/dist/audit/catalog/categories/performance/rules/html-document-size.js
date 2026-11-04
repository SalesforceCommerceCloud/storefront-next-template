import "../../../../../har.js";
import { i as kib, n as documentSizeDataSchema, r as documentSizeRule } from "../../../../../document-size.js";

//#region src/audit/catalog/categories/performance/rules/html-document-size.ts
var html_document_size_default = documentSizeRule({
	label: "HTML size",
	budget: 350 * 1024,
	value: (size) => size.htmlBytes,
	format: kib,
	evidence: () => null,
	decideFailures: true
});

//#endregion
export { documentSizeDataSchema as dataSchema, html_document_size_default as default };