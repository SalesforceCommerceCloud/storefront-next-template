import { z } from "zod";
import { parse } from "parse5";

//#region src/audit/rule-helpers/deferred-ui.ts
const HIDDEN_ELEMENTS_MIN = 100;
const HIDDEN_SHARE_MIN = .2;
const hiddenRootSchema = z.object({
	selector: z.string(),
	elements: z.number().int().positive()
}).strict();
const BREAKPOINT_WIDTHS = {
	sm: 640,
	md: 768,
	lg: 1024,
	xl: 1280,
	"2xl": 1536
};
const VIEWPORT_WIDTHS = {
	mobile: 360,
	desktop: 1728
};
const MAX_SOURCE_ELEMENTS = 25e4;
const MAX_SOURCE_NESTING = 2e3;
const VOID_ELEMENTS = new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr"
]);
const OPTIONAL_END_ELEMENTS = new Set([
	"colgroup",
	"dd",
	"dt",
	"li",
	"option",
	"p",
	"tbody",
	"td",
	"tfoot",
	"th",
	"thead",
	"tr"
]);
const FOREIGN_BREAKOUT_ELEMENTS = new Set([
	"b",
	"big",
	"blockquote",
	"body",
	"br",
	"center",
	"code",
	"dd",
	"div",
	"dl",
	"dt",
	"em",
	"embed",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"head",
	"hr",
	"i",
	"img",
	"li",
	"listing",
	"menu",
	"meta",
	"nobr",
	"ol",
	"p",
	"pre",
	"ruby",
	"s",
	"small",
	"span",
	"strike",
	"strong",
	"sub",
	"sup",
	"table",
	"tt",
	"u",
	"ul",
	"var"
]);
const DISPLAY = new Set([
	"block",
	"contents",
	"flex",
	"flow-root",
	"grid",
	"inline",
	"inline-block",
	"inline-flex",
	"inline-grid",
	"inline-table",
	"list-item",
	"ruby",
	"ruby-base",
	"ruby-base-container",
	"ruby-text",
	"ruby-text-container",
	"table",
	"table-caption",
	"table-cell",
	"table-column",
	"table-column-group",
	"table-footer-group",
	"table-header-group",
	"table-row",
	"table-row-group"
]);
function isElement(node) {
	return "tagName" in node;
}
function attributes(element) {
	return new Map(element.attrs.map((attribute) => [attribute.name, attribute.value]));
}
function elementChildren(element) {
	return element.childNodes.filter(isElement);
}
function segmentId(attrs) {
	return /S:[0-9a-f]+$/i.test(attrs.get("id") ?? "");
}
function isTableScaffold(element) {
	const children = elementChildren(element);
	if (children.length !== 1) return false;
	const child = children[0];
	if (["tbody", "colgroup"].includes(child.tagName) && segmentId(attributes(child))) return true;
	if (child.tagName !== "tbody") return false;
	const rows = elementChildren(child);
	return rows.length === 1 && rows[0].tagName === "tr" && segmentId(attributes(rows[0]));
}
function streamingSegment(element, attrs) {
	if (segmentId(attrs)) {
		if (["div", "table"].includes(element.tagName) && attrs.has("hidden")) return true;
		if (["svg", "math"].includes(element.tagName) && attrs.get("aria-hidden") === "true" && /(?:^|;)\s*display\s*:\s*none\s*(?:;|$)/i.test(attrs.get("style") ?? "")) return true;
	}
	return element.tagName === "table" && attrs.has("hidden") && isTableScaffold(element);
}
function tagEnd(html, start) {
	let quote = "";
	for (let index = start; index < html.length; index += 1) {
		const character = html[index];
		if (quote) {
			if (character === quote) quote = "";
		} else if (character === "\"" || character === "'") quote = character;
		else if (character === ">") return index;
	}
	return html.length - 1;
}
function sourceAttributes(source) {
	const result = /* @__PURE__ */ new Map();
	let index = 1;
	while (index < source.length && !/[\s/>]/.test(source[index])) index += 1;
	while (index < source.length) {
		while (/\s/.test(source[index] ?? "")) index += 1;
		if (source[index] === ">" || source[index] === "/" || source[index] === void 0) break;
		const nameStart = index;
		while (index < source.length && !/[\s=/><]/.test(source[index])) index += 1;
		if (index === nameStart) {
			index += 1;
			continue;
		}
		const name = source.slice(nameStart, index).toLowerCase();
		while (/\s/.test(source[index] ?? "")) index += 1;
		let value = "";
		if (source[index] === "=") {
			index += 1;
			while (/\s/.test(source[index] ?? "")) index += 1;
			const quote = source[index] === "\"" || source[index] === "'" ? source[index++] : "";
			const valueStart = index;
			if (quote) {
				while (index < source.length && source[index] !== quote) index += 1;
				value = source.slice(valueStart, index);
				if (source[index] === quote) index += 1;
			} else {
				while (index < source.length && !/[\s>]/.test(source[index])) index += 1;
				value = source.slice(valueStart, index);
			}
		}
		if (name) result.set(name, value);
	}
	return result;
}
/** Bound parse work before building a DOM. This intentionally ignores optional-end-tag elements. */
function assertHtmlComplexity(html) {
	const lower = html.toLowerCase();
	const stack = [];
	const makesHtmlChild = (parent, childName) => {
		if (parent.namespace === "svg") return [
			"desc",
			"foreignobject",
			"title"
		].includes(parent.name);
		if (parent.namespace !== "math") return false;
		if (parent.name === "annotation-xml") return parent.annotationHtml;
		return [
			"mi",
			"mn",
			"mo",
			"ms",
			"mtext"
		].includes(parent.name) && !["malignmark", "mglyph"].includes(childName);
	};
	let elements = 0;
	let index = 0;
	while (index < html.length) {
		const start = html.indexOf("<", index);
		if (start < 0) break;
		if (html.startsWith("<!--", start)) {
			const end$1 = html.indexOf("-->", start + 4);
			index = end$1 < 0 ? html.length : end$1 + 3;
			continue;
		}
		let cursor = start + 1;
		const closing = html[cursor] === "/";
		if (closing) cursor += 1;
		while (/\s/.test(html[cursor] ?? "")) cursor += 1;
		const match = /^[a-z][a-z0-9:-]*/i.exec(html.slice(cursor));
		const end = tagEnd(html, cursor);
		if (!match) {
			index = end + 1;
			continue;
		}
		const name = match[0].toLowerCase();
		if (closing) {
			let openIndex = -1;
			for (let candidate = stack.length - 1; candidate >= 0; candidate -= 1) if (stack[candidate].name === name) {
				openIndex = candidate;
				break;
			}
			if (openIndex >= 0) stack.length = openIndex;
			index = end + 1;
			continue;
		}
		elements += 1;
		if (elements > MAX_SOURCE_ELEMENTS) throw new Error(`HTML exceeds the ${MAX_SOURCE_ELEMENTS}-element measurement limit.`);
		if (name === "script" || name === "style") {
			const closeStart = lower.indexOf(`</${name}`, end + 1);
			index = closeStart < 0 ? html.length : tagEnd(html, closeStart + 2) + 1;
			continue;
		}
		const source = html.slice(start, end + 1);
		const sourceAttrs = sourceAttributes(source);
		let parent = stack.at(-1);
		const fontBreakout = name === "font" && [
			"color",
			"face",
			"size"
		].some((attribute) => sourceAttrs.has(attribute));
		if (parent && parent.namespace !== "html" && !makesHtmlChild(parent, name) && (FOREIGN_BREAKOUT_ELEMENTS.has(name) || fontBreakout)) while ((parent = stack.at(-1)) && parent.namespace !== "html" && !makesHtmlChild(parent, name)) stack.pop();
		parent = stack.at(-1);
		let namespace = (parent ? makesHtmlChild(parent, name) : false) ? "html" : parent?.namespace ?? "html";
		if (namespace === "html" && name === "svg") namespace = "svg";
		else if (namespace === "html" && name === "math") namespace = "math";
		const foreignSelfClosing = namespace !== "html" && /\/\s*>$/.test(source);
		const htmlVoid = namespace === "html" && VOID_ELEMENTS.has(name);
		const optionalEnd = namespace === "html" && OPTIONAL_END_ELEMENTS.has(name);
		if (!foreignSelfClosing && !htmlVoid && !optionalEnd) {
			const encoding = name === "annotation-xml" ? sourceAttrs.get("encoding")?.toLowerCase() : void 0;
			const annotationHtml = namespace === "math" && name === "annotation-xml" && (encoding === "text/html" || encoding === "application/xhtml+xml");
			stack.push({
				name,
				namespace,
				annotationHtml
			});
			if (stack.length > MAX_SOURCE_NESTING) throw new Error(`HTML exceeds the ${MAX_SOURCE_NESTING}-level nesting limit.`);
		}
		index = end + 1;
	}
}
function isBreakpoint(value) {
	return Object.hasOwn(BREAKPOINT_WIDTHS, value);
}
function breakpointWidth(value) {
	if (isBreakpoint(value)) return BREAKPOINT_WIDTHS[value];
	const arbitrary = /^\[(\d+(?:\.\d+)?)(px|rem)\]$/.exec(value);
	if (!arbitrary) return void 0;
	const width = Number(arbitrary[1]);
	return arbitrary[2] === "rem" ? width * 16 : width;
}
function visibilityRule(className) {
	const parts = className.split(":");
	const utility = parts.pop();
	if (utility !== "hidden" && !DISPLAY.has(utility)) return void 0;
	let min = 0;
	let max = Number.POSITIVE_INFINITY;
	for (const variant of parts) {
		const maxVariant = variant.startsWith("max-");
		const minVariant = variant.startsWith("min-");
		const width = breakpointWidth(maxVariant || minVariant ? variant.slice(4) : variant);
		if (width === void 0) return void 0;
		if (maxVariant) max = Math.min(max, width);
		else min = Math.max(min, width);
	}
	return {
		min,
		max,
		utility
	};
}
function inlineDisplay(style) {
	let selected;
	for (const declaration of style.split(";")) {
		const match = /^\s*display\s*:\s*([^!]+?)(\s*!important)?\s*$/i.exec(declaration);
		if (!match) continue;
		const value = match[1].trim().toLowerCase();
		if (value !== "none" && !DISPLAY.has(value)) continue;
		const candidate = {
			hidden: value === "none",
			important: match[2] !== void 0
		};
		if (!selected || candidate.important || !selected.important) selected = candidate;
	}
	return selected?.hidden;
}
function hiddenAt(element, viewport) {
	const attrs = attributes(element);
	const classes = (attrs.get("class") ?? "").split(/\s+/).filter(Boolean);
	const streaming = streamingSegment(element, attrs);
	const hiddenAttribute = attrs.has("hidden") && !streaming;
	const inlineHidden = streaming ? void 0 : inlineDisplay(attrs.get("style") ?? "");
	if (inlineHidden !== void 0) return inlineHidden;
	if (hiddenAttribute) return true;
	const width = VIEWPORT_WIDTHS[viewport];
	const rules = classes.map(visibilityRule).filter((rule) => rule !== void 0).filter((rule) => width >= rule.min && width < rule.max).slice().sort((a, b) => a.min - b.min || b.max - a.max);
	let hidden = false;
	for (let index = 0; index < rules.length;) {
		const rule = rules[index];
		const sameRange = [];
		while (index < rules.length && rules[index].min === rule.min && rules[index].max === rule.max) sameRange.push(rules[index++]);
		hidden = sameRange.some((candidate) => candidate.utility === "hidden");
	}
	return hidden;
}
function selector(element) {
	const attrs = attributes(element);
	const id = attrs.get("id");
	if (id) return `${element.tagName}#${id}`.slice(0, 160);
	const classes = (attrs.get("class") ?? "").split(/\s+/).filter(Boolean).slice(0, 3);
	return `${element.tagName}${classes.map((className) => `.${className}`).join("")}`.slice(0, 160);
}
function elementCount(element) {
	let count = 0;
	const stack = [element];
	while (stack.length) {
		const current = stack.pop();
		count += 1;
		for (const child of elementChildren(current)) stack.push(child);
	}
	return count;
}
function body(document) {
	const stack = [document];
	while (stack.length) {
		const node = stack.pop();
		if (isElement(node) && node.tagName === "body") return node;
		if ("childNodes" in node) for (let index = node.childNodes.length - 1; index >= 0; index -= 1) stack.push(node.childNodes[index]);
	}
}
function viewportMeasurement(root, viewport, bodyElements) {
	let hiddenElements = 0;
	const roots = [];
	const stack = [{
		element: root,
		inheritedHidden: false
	}];
	while (stack.length) {
		const { element, inheritedHidden } = stack.pop();
		const hidden = inheritedHidden || hiddenAt(element, viewport);
		if (hidden) hiddenElements += 1;
		if (hidden && !inheritedHidden) roots.push({
			selector: selector(element),
			elements: elementCount(element)
		});
		const children = elementChildren(element);
		for (let index = children.length - 1; index >= 0; index -= 1) stack.push({
			element: children[index],
			inheritedHidden: hidden
		});
	}
	return {
		hiddenElements,
		share: bodyElements ? hiddenElements / bodyElements : 0,
		largestRoots: roots.slice().sort((a, b) => b.elements - a.elements).slice(0, 5)
	};
}
/** Measure hidden element trees in server-rendered HTML at the calibrated 360 px and 1728 px viewports. */
function measureHiddenMarkup(html) {
	assertHtmlComplexity(html);
	const root = body(parse(html));
	if (!root) return {
		bodyElements: 0,
		mobile: {
			hiddenElements: 0,
			share: 0,
			largestRoots: []
		},
		desktop: {
			hiddenElements: 0,
			share: 0,
			largestRoots: []
		}
	};
	const bodyElements = elementCount(root);
	return {
		bodyElements,
		mobile: viewportMeasurement(root, "mobile", bodyElements),
		desktop: viewportMeasurement(root, "desktop", bodyElements)
	};
}
function isHiddenMarkupCandidate(hiddenElements, bodyElements) {
	return hiddenElements >= HIDDEN_ELEMENTS_MIN && bodyElements > 0 && hiddenElements / bodyElements >= HIDDEN_SHARE_MIN;
}

//#endregion
//#region src/audit/catalog/categories/best-practices/rules/deferred-ui.ts
const FORM_FACTORS = ["mobile", "desktop"];
const PAGE_CONCURRENCY = 2;
const SAFE_RUN_ID = /^[a-z0-9][a-z0-9_-]*$/i;
const summarySchema = z.object({ runs: z.array(z.object({
	runId: z.string().optional(),
	formFactor: z.string().optional(),
	cacheState: z.string().optional(),
	isMedian: z.boolean().optional()
}).passthrough()).optional().default([]) }).passthrough();
const cellSchema = z.object({
	cell: z.enum(["mobile-cold", "desktop-cold"]),
	runId: z.string(),
	artifact: z.string(),
	bodyElements: z.number().int().positive(),
	hiddenElements: z.number().int().nonnegative(),
	hiddenShare: z.number().min(0).max(1),
	candidate: z.boolean(),
	largestHiddenRoots: z.array(hiddenRootSchema)
}).strict();
const dataSchema = z.object({
	thresholds: z.object({
		hiddenElements: z.number().int().positive(),
		hiddenShare: z.number().min(0).max(1)
	}).strict(),
	pages: z.array(z.object({
		page: z.string(),
		cells: z.array(cellSchema)
	}).strict()),
	skipped: z.array(z.object({
		page: z.string(),
		cell: z.string(),
		reason: z.string()
	}).strict())
}).strict();
function runIdFor(summary, formFactor) {
	const runs = (summary?.runs ?? []).filter((run$1) => run$1.runId && SAFE_RUN_ID.test(run$1.runId) && run$1.formFactor === formFactor && run$1.cacheState === "cold");
	return (runs.find((run$1) => run$1.isMedian) ?? runs[0])?.runId ?? `${formFactor}-cold-1`;
}
async function measureCell(playhouse, page, summary, formFactor) {
	const cell = `${formFactor}-cold`;
	const runId = runIdFor(summary, formFactor);
	const artifact = `runs/${runId}/main-document.html`;
	let html;
	try {
		html = await playhouse.readText(page, artifact, 10 * 1024 * 1024);
	} catch {
		return {
			cell,
			reason: `${artifact} could not be read safely.`
		};
	}
	if (html === void 0) return {
		cell,
		reason: `${artifact} is missing.`
	};
	let measured;
	try {
		measured = measureHiddenMarkup(html);
	} catch {
		return {
			cell,
			reason: `${artifact} could not be measured safely.`
		};
	}
	if (!measured.bodyElements) return {
		cell,
		reason: `${artifact} has no body elements.`
	};
	const viewport = measured[formFactor];
	return {
		cell,
		runId,
		artifact,
		bodyElements: measured.bodyElements,
		hiddenElements: viewport.hiddenElements,
		hiddenShare: viewport.share,
		candidate: isHiddenMarkupCandidate(viewport.hiddenElements, measured.bodyElements),
		largestHiddenRoots: viewport.largestRoots
	};
}
const run = async ({ pages, playhouse }) => {
	const data = {
		thresholds: {
			hiddenElements: HIDDEN_ELEMENTS_MIN,
			hiddenShare: HIDDEN_SHARE_MIN
		},
		pages: [],
		skipped: []
	};
	const evidence = [];
	let candidate = false;
	let incomplete = false;
	const measuredPages = [];
	for (let offset = 0; offset < pages.length; offset += PAGE_CONCURRENCY) {
		const batch = await Promise.all(pages.slice(offset, offset + PAGE_CONCURRENCY).map(async (page) => {
			const summary = await playhouse.readJson(page.label, "summary.json", summarySchema);
			return {
				page,
				cells: await Promise.all(FORM_FACTORS.map((formFactor) => measureCell(playhouse, page.label, summary, formFactor)))
			};
		}));
		measuredPages.push(...batch);
	}
	for (const { page, cells: results } of measuredPages) {
		const cells = [];
		for (const result of results) {
			if ("reason" in result) {
				incomplete = true;
				data.skipped.push({
					page: page.label,
					cell: result.cell,
					reason: result.reason
				});
				continue;
			}
			cells.push(result);
			candidate ||= result.candidate;
			evidence.push({
				type: "playhouse",
				page: page.label,
				artifact: result.artifact,
				value: `${result.cell}: ${result.hiddenElements} of ${result.bodyElements} body elements hidden (${Math.round(result.hiddenShare * 100)}%; candidate gate ${HIDDEN_ELEMENTS_MIN} and ${Math.round(HIDDEN_SHARE_MIN * 100)}%).`
			});
		}
		data.pages.push({
			page: page.label,
			cells
		});
	}
	if (!evidence.length || incomplete || candidate) return { data };
	return {
		data,
		decision: {
			status: "pass",
			summary: `Server-rendered hidden markup stays below the candidate gate on every measured page.`,
			evidence
		}
	};
};
var deferred_ui_default = run;

//#endregion
export { dataSchema, deferred_ui_default as default };