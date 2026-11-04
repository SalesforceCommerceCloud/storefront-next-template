import { a as harRuleDataSchema, f as tokens, i as harRule, o as header } from "../../../../../har.js";

//#region src/audit/catalog/categories/security/rules/browser-hardening-headers.ts
const dataSchema = harRuleDataSchema;
const REFERRER_POLICIES = [
	"no-referrer",
	"same-origin",
	"strict-origin",
	"strict-origin-when-cross-origin"
];
var browser_hardening_headers_default = harRule("HTML page responses", ({ document }) => {
	const { entry } = document;
	const headers = {
		"x-content-type-options": header(entry, "x-content-type-options"),
		"x-frame-options": header(entry, "x-frame-options"),
		"referrer-policy": header(entry, "referrer-policy"),
		"permissions-policy": header(entry, "permissions-policy")
	};
	const reasons = [];
	if (headers["x-content-type-options"]?.trim().toLowerCase() !== "nosniff") reasons.push("X-Content-Type-Options is not nosniff.");
	if (!/(?:^|[;,])\s*frame-ancestors\b/i.test(header(entry, "content-security-policy") ?? "") && !headers["x-frame-options"]) reasons.push("Neither CSP frame-ancestors nor X-Frame-Options is set.");
	const referrer = tokens(headers["referrer-policy"]).at(-1);
	if (!referrer) reasons.push("Referrer-Policy is missing.");
	else if (!REFERRER_POLICIES.includes(referrer)) reasons.push(`Referrer-Policy ${referrer} discloses more than the baseline allows.`);
	if (!headers["permissions-policy"]) reasons.push("Permissions-Policy is missing.");
	return {
		responses: 1,
		failures: reasons.length ? [{
			entry: document,
			reasons,
			headers
		}] : []
	};
}, "send nosniff, block framing by other sites, limit the referrer and set a Permissions-Policy");

//#endregion
export { dataSchema, browser_hardening_headers_default as default };