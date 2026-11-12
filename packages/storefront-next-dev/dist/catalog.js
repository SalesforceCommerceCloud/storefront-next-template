import { x as AUDIT_ROOT } from "./results.js";
import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { z } from "zod";
import { parse } from "yaml";

//#region src/audit/catalog.ts
const metadataSchema = z.object({
	id: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/),
	title: z.string().min(1),
	severity: z.enum([
		"critical",
		"high",
		"medium",
		"low",
		"info"
	]),
	appliesTo: z.array(z.string()).default([]),
	inputs: z.array(z.string()).min(1)
});
const requiredSections = [
	"Intent",
	"Inspect",
	"Evaluate",
	"Evidence",
	"Remediation",
	"Examples"
];
function frontmatter(markdown, file) {
	const match = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	if (!match) throw new Error(`${file}: missing YAML frontmatter`);
	return {
		metadata: parse(match[1] ?? ""),
		body: match[2] ?? ""
	};
}
async function discoverCatalog(categoriesDir) {
	const entries = (await readdir(categoriesDir, { withFileTypes: true })).filter((entry) => entry.isDirectory()).slice().sort((a, b) => a.name.localeCompare(b.name));
	const seen = /* @__PURE__ */ new Set();
	const categories = [];
	for (const entry of entries) {
		const categoryFile = path.join(categoriesDir, entry.name, "CATEGORY.md");
		const guidance = await readFile(categoryFile, "utf8");
		const title = guidance.match(/^#\s+(.+)$/m)?.[1]?.trim();
		if (!title) throw new Error(`${categoryFile}: missing category title`);
		const rulesDir = path.join(categoriesDir, entry.name, "rules");
		let discoveredRules;
		try {
			discoveredRules = await readdir(rulesDir, { withFileTypes: true });
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
			discoveredRules = [];
		}
		const ruleEntries = discoveredRules.filter((rule) => rule.isFile() && rule.name.endsWith(".md")).slice().sort((a, b) => a.name.localeCompare(b.name));
		const rules = [];
		for (const ruleEntry of ruleEntries) {
			const file = path.join(rulesDir, ruleEntry.name);
			const { metadata, body } = frontmatter(await readFile(file, "utf8"), file);
			const parsed = metadataSchema.parse(metadata);
			const expected = `${entry.name}/${ruleEntry.name.slice(0, -3)}`;
			if (parsed.id !== expected) throw new Error(`${file}: id must be ${expected}`);
			if (seen.has(parsed.id)) throw new Error(`${file}: duplicate rule id ${parsed.id}`);
			for (const section of requiredSections) if (!new RegExp(`^## ${section}\\s*$`, "m").test(body)) throw new Error(`${file}: missing ## ${section}`);
			seen.add(parsed.id);
			rules.push({
				...parsed,
				file,
				instructions: body.trim()
			});
		}
		categories.push({
			id: entry.name,
			title,
			file: categoryFile,
			guidance,
			rules
		});
	}
	return {
		categories,
		ruleIds: [...seen].sort()
	};
}
function defaultCategoriesDir() {
	return path.join(AUDIT_ROOT, "catalog", "categories");
}

//#endregion
export { discoverCatalog as n, defaultCategoriesDir as t };