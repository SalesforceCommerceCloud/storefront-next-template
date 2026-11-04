import { c as matchDocument, s as headerValues } from "../../../../../har.js";
import { z } from "zod";

//#region src/audit/catalog/categories/security/rules/strict-transport-security.ts
const documentResultSchema = z.object({
	page: z.string(),
	cell: z.string(),
	harArtifact: z.string(),
	networkArtifact: z.string(),
	finalUrl: z.string().nullable(),
	statusCode: z.number().nullable(),
	header: z.string().nullable(),
	maxAgeSeconds: z.number().nullable(),
	includeSubDomains: z.boolean(),
	result: z.enum([
		"pass",
		"fail",
		"not-evaluated"
	]),
	reasons: z.array(z.string()),
	evidence: z.array(z.object({
		artifact: z.string(),
		pointer: z.string(),
		value: z.union([
			z.string(),
			z.number(),
			z.boolean()
		]).optional()
	}).strict())
}).strict();
const dataSchema = z.object({ documents: z.array(documentResultSchema) }).strict();
const MIN_MAX_AGE_SECONDS = 15552e3;
function isDevelopmentUrl(value) {
	try {
		const url = new URL(value);
		return url.protocol !== "https:" || [
			"localhost",
			"127.0.0.1",
			"::1"
		].includes(url.hostname);
	} catch {
		return true;
	}
}
function parseHeader(value) {
	if (value === null) return {
		maxAgeSeconds: null,
		includeSubDomains: false
	};
	const directives = value.split(";").map((item) => item.trim()).filter(Boolean);
	const match = directives.find((item) => /^max-age\s*=/i.test(item))?.match(/^max-age\s*=\s*"?(\d+)"?$/i);
	return {
		maxAgeSeconds: match ? Number(match[1]) : null,
		includeSubDomains: directives.some((item) => /^includesubdomains$/i.test(item))
	};
}
const prepare = async ({ pages, playhouse }) => {
	const documents = [];
	for (const page of pages) {
		const harArtifacts = (await playhouse.artifactNames(page.label)).filter((name) => /^network-.+\.har$/.test(name));
		if (!harArtifacts.length) {
			documents.push({
				page: page.label,
				cell: "unknown",
				harArtifact: "network-{cell}.har",
				networkArtifact: "network-{cell}.json",
				finalUrl: null,
				statusCode: null,
				header: null,
				maxAgeSeconds: null,
				includeSubDomains: false,
				result: "not-evaluated",
				reasons: ["No representative HAR artifact was available."],
				evidence: []
			});
			continue;
		}
		for (const harArtifact of harArtifacts) {
			const cell = /^network-(.+)\.har$/.exec(harArtifact)?.[1];
			if (!cell) continue;
			const networkArtifact = `network-${cell}.json`;
			const match = await matchDocument(playhouse, page.label, cell);
			const { finalUrl } = match;
			if (finalUrl && isDevelopmentUrl(finalUrl)) {
				documents.push({
					page: page.label,
					cell,
					harArtifact,
					networkArtifact,
					finalUrl,
					statusCode: null,
					header: null,
					maxAgeSeconds: null,
					includeSubDomains: false,
					result: "not-evaluated",
					reasons: ["The final document is not an eligible public HTTPS URL."],
					evidence: []
				});
				continue;
			}
			if ("reason" in match) {
				documents.push({
					page: page.label,
					cell,
					harArtifact,
					networkArtifact,
					finalUrl,
					statusCode: null,
					header: null,
					maxAgeSeconds: null,
					includeSubDomains: false,
					result: "not-evaluated",
					reasons: [match.reason],
					evidence: []
				});
				continue;
			}
			const matched = match.document;
			const hstsHeaders = headerValues(matched.entry, "strict-transport-security");
			const header = hstsHeaders.length === 1 ? hstsHeaders[0].value : null;
			const parsed = parseHeader(header);
			const reasons = [];
			if (hstsHeaders.length === 0) reasons.push("Strict-Transport-Security is missing.");
			else if (hstsHeaders.length > 1) reasons.push("Multiple Strict-Transport-Security headers make the effective policy ambiguous.");
			if (hstsHeaders.length === 1 && parsed.maxAgeSeconds === null) reasons.push("max-age is missing or invalid.");
			else if (parsed.maxAgeSeconds !== null && parsed.maxAgeSeconds < MIN_MAX_AGE_SECONDS) reasons.push(`max-age is below ${MIN_MAX_AGE_SECONDS} seconds.`);
			if (hstsHeaders.length === 1 && !parsed.includeSubDomains) reasons.push("includeSubDomains is missing.");
			const result = hstsHeaders.length > 1 ? "not-evaluated" : reasons.length ? "fail" : "pass";
			const evidence = [{
				artifact: harArtifact,
				pointer: `/log/entries/${matched.index}/request/url`,
				value: match.finalUrl
			}, ...header !== null ? [{
				artifact: harArtifact,
				pointer: `/log/entries/${matched.index}/response/headers/${hstsHeaders[0].index}/value`,
				value: header
			}] : []];
			documents.push({
				page: page.label,
				cell,
				harArtifact,
				networkArtifact,
				finalUrl: match.finalUrl,
				statusCode: matched.entry.response.status,
				header,
				maxAgeSeconds: parsed.maxAgeSeconds,
				includeSubDomains: parsed.includeSubDomains,
				result,
				reasons,
				evidence
			});
		}
	}
	const failed = documents.filter((item) => item.result === "fail");
	const unresolved = documents.filter((item) => item.result === "not-evaluated");
	const passed = documents.filter((item) => item.result === "pass");
	const evidenceFor = (items) => items.flatMap((item) => item.evidence.map((evidence) => ({
		type: "playhouse",
		page: item.page,
		...evidence
	})));
	if (failed.length) return {
		data: { documents },
		decision: {
			status: "fail",
			summary: `${failed.length} HTML page response${failed.length === 1 ? "" : "s"} failed the HSTS baseline (max-age of at least 15552000 seconds with includeSubDomains).`,
			evidence: evidenceFor(failed)
		}
	};
	if (passed.length && !unresolved.length) return {
		data: { documents },
		decision: {
			status: "pass",
			summary: `${passed.length} HTML page response${passed.length === 1 ? "" : "s"} sent Strict-Transport-Security with a max-age of at least 15552000 seconds and includeSubDomains.`,
			evidence: evidenceFor(passed)
		}
	};
	return { data: { documents } };
};
var strict_transport_security_default = prepare;

//#endregion
export { dataSchema, strict_transport_security_default as default };