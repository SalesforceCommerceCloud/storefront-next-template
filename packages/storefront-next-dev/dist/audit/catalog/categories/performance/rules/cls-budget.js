import "../../../../../measured-run.js";
import { n as metricBudget, t as dataSchema } from "../../../../../metric-budget.js";

//#region src/audit/catalog/categories/performance/rules/cls-budget.ts
var cls_budget_default = metricBudget({
	metric: "cls",
	label: "CLS",
	threshold: .1,
	format: (value) => value.toFixed(2)
});

//#endregion
export { dataSchema, cls_budget_default as default };