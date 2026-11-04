import { a as harRuleDataSchema, i as harRule, o as header } from "../../../../../har.js";

//#region src/audit/catalog/categories/security/rules/content-security-policy.ts
const dataSchema = harRuleDataSchema;
/** Each comma-separated policy as directive → lowercased sources; every enforced policy applies. */
function policies(value) {
	return (value ?? "").split(",").map((policy) => new Map(policy.split(";").flatMap((directive) => {
		const [name, ...sources] = directive.trim().toLowerCase().split(/\s+/);
		return name ? [[name, sources]] : [];
	}))).filter((policy) => policy.size);
}
var content_security_policy_default = harRule("HTML page responses", ({ document }) => {
	const { entry } = document;
	const headers = {
		"content-security-policy": header(entry, "content-security-policy"),
		"content-security-policy-report-only": header(entry, "content-security-policy-report-only")
	};
	const enforced = policies(headers["content-security-policy"]);
	const reasons = [];
	if (!enforced.length) reasons.push(headers["content-security-policy-report-only"] ? "Content-Security-Policy is report-only." : "Content-Security-Policy is missing.");
	else {
		if (enforced.some((policy) => [...policy.values()].some((sources) => sources.includes("'unsafe-eval'")))) reasons.push("CSP allows 'unsafe-eval'.");
		if (!enforced.some((policy) => {
			const sources = policy.get("script-src") ?? policy.get("default-src");
			return sources !== void 0 && !sources.includes("*");
		})) reasons.push("CSP does not restrict scripts: script-src (or default-src without script-src) is missing or allows *.");
		for (const directive of ["frame-ancestors", "form-action"]) if (!enforced.some((policy) => policy.has(directive))) reasons.push(`CSP ${directive} is missing.`);
	}
	return {
		responses: 1,
		failures: reasons.length ? [{
			entry: document,
			reasons,
			headers
		}] : []
	};
}, "enforce a Content Security Policy that restricts scripts, framing and form targets and doesn't allow 'unsafe-eval'");

//#endregion
export { dataSchema, content_security_policy_default as default };