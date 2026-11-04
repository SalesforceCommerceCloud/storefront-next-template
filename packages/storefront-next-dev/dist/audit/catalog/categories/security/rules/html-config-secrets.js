import "../../../../../har.js";
import { a as measurePage } from "../../../../../document-size.js";
import { z } from "zod";

//#region src/audit/catalog/categories/security/rules/html-config-secrets.ts
const dataSchema = z.object({
	pages: z.array(z.object({
		page: z.string(),
		url: z.string(),
		appConfig: z.array(z.string()),
		pageData: z.array(z.string()),
		other: z.array(z.string())
	}).strict()),
	skipped: z.array(z.object({
		page: z.string(),
		reason: z.string()
	}).strict())
}).strict();
/** Lists the inline scripts archived from each page's HTML for the agent to review; secrets can't be recognized by a script, so this never decides. */
const listInlineScripts = async ({ pages, playhouse }) => {
	const data = {
		pages: [],
		skipped: []
	};
	for (const page of pages) {
		const size = await measurePage(playhouse, page.label);
		if ("reason" in size) data.skipped.push({
			page: page.label,
			reason: size.reason
		});
		else if (size.markupBytes === null) data.skipped.push({
			page: page.label,
			reason: "Playhouse archived no inline scripts for this page."
		});
		else data.pages.push({
			page: page.label,
			url: size.url,
			...size.scripts
		});
	}
	return { data };
};
var html_config_secrets_default = listInlineScripts;

//#endregion
export { dataSchema, html_config_secrets_default as default };