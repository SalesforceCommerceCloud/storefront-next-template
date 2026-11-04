import "../../../../../har.js";
import { i as kib, n as documentSizeDataSchema, r as documentSizeRule } from "../../../../../document-size.js";

//#region src/audit/catalog/categories/performance/rules/page-data-size.ts
var page_data_size_default = documentSizeRule({
	label: "Page data",
	budget: 200 * 1024,
	value: (size) => size.pageDataBytes,
	format: kib,
	evidence: (size) => size.scripts.pageData[0] ? { artifact: size.scripts.pageData[0] } : null,
	decideFailures: false
});

//#endregion
export { documentSizeDataSchema as dataSchema, page_data_size_default as default };