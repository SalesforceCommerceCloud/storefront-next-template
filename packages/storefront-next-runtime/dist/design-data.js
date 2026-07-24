//#region src/design/data/errors/visitor-context-error.ts
var VisitorContextError = class VisitorContextError extends Error {
	constructor(message) {
		super(message);
		this.name = "VisitorContextError";
	}
	static assert(parentType, childType) {
		if (parentType === "component" && childType !== "region" || parentType === "page" && childType !== "region" || parentType === "region" && childType !== "component") throw new VisitorContextError(`Invalid child context type ${childType} for parent context type ${parentType}`);
	}
};

//#endregion
//#region src/design/data/page/transform.ts
/**
* Context object passed to {@link PageVisitor} handler methods during page tree
* traversal. Provides access to the current node via {@link node}, the tree
* position via {@link page}, {@link parentRegion}, and {@link parentComponent},
* and traversal methods ({@link visitRegions}, {@link visitComponents}) for
* continuing into child nodes.
*
* When a visitor handler is defined, the handler is responsible for traversing
* into children by calling the appropriate context method. If the handler does
* not call these methods, children will not be visited.
*/
var VisitorContext = class VisitorContext {
	constructor(context) {
		this.context = context;
	}
	get type() {
		return this.context.type;
	}
	/**
	* The current node being visited.
	*/
	get node() {
		return this.context.node;
	}
	/**
	* The root page being traversed.
	*/
	get page() {
		return this.context.page;
	}
	/**
	* The parent visitor context, providing access to the node that contains the current one in the page tree.
	*/
	get parent() {
		return this.context.parent;
	}
	/**
	* The parent region of the current node, if traversing within a region.
	*/
	get parentRegion() {
		return this.context.parentRegion;
	}
	/**
	* The parent component of the current node, if traversing within a component's nested regions.
	*/
	get parentComponent() {
		return this.context.parentComponent;
	}
	/**
	* Traverses an array of regions, invoking the visitor's `visitRegion` handler
	* on each one. Regions for which the handler returns `null` are excluded from
	* the result. Call this from within a `visitPage` or `visitComponent` handler
	* to continue traversal into child regions.
	*
	* @param regions - The regions to traverse.
	* @returns The filtered array of transformed regions.
	*
	* @example
	* ```ts
	* transformPage(page, {
	*     visitPage(context) {
	*         // Traverse into regions explicitly
	*         const regions = context.visitRegions(context.node.regions);
	*         return { ...context.node, regions };
	*     },
	* });
	* ```
	*/
	visitRegions(regions = []) {
		const newRegions = [];
		for (const region of regions) {
			const newRegion = this.visitRegion(region);
			if (newRegion) newRegions.push(newRegion);
		}
		return newRegions;
	}
	/**
	* Traverses a single region. If the visitor has a `visitRegion` handler, the
	* handler is called with a new {@link VisitorContext} for the region. Otherwise,
	* the region's child components are traversed automatically.
	*
	* @param region - The region to visit.
	* @returns The transformed region, or `null` to exclude it.
	*/
	visitRegion(region) {
		const regionContext = this.toChildContext("region", region);
		if (this.context.visitor.visitRegion) return this.context.visitor.visitRegion(regionContext);
		else if (region.components) return {
			...region,
			components: regionContext.visitComponents(region.components)
		};
		return region;
	}
	/**
	* Traverses an array of components, invoking the visitor's `visitComponent`
	* handler on each one. Components for which the handler returns `null` are
	* excluded from the result. Call this from within a `visitRegion` handler to
	* continue traversal into child components.
	*
	* @param components - The components to traverse.
	* @returns The filtered array of transformed components.
	*
	* @example
	* ```ts
	* transformPage(page, {
	*     visitRegion(context) {
	*         // Traverse into components explicitly
	*         const components = context.visitComponents(context.node.components);
	*         return { ...context.node, components };
	*     },
	* });
	* ```
	*/
	visitComponents(components = []) {
		const newComponents = [];
		for (const component of components) {
			const newComponent = this.visitComponent(component);
			if (newComponent) newComponents.push(newComponent);
		}
		return newComponents;
	}
	/**
	* Traverses a single component. If the visitor has a `visitComponent` handler,
	* the handler is called with a new {@link VisitorContext} for the component.
	* Otherwise, the component's nested regions are traversed automatically.
	*
	* @param component - The component to visit.
	* @returns The transformed component, or `null` to exclude it.
	*/
	visitComponent(component) {
		const componentContext = this.toChildContext("component", component);
		if (this.context.visitor.visitComponent) return this.context.visitor.visitComponent(componentContext);
		else if (component.regions) return {
			...component,
			regions: componentContext.visitRegions(component.regions)
		};
		return component;
	}
	/**
	* Traverses a single page. If the visitor has a `visitPage` handler, the
	* handler is called with a new {@link VisitorContext} for the page. Otherwise,
	* the page's regions are traversed automatically.
	*
	* @param page - The page to visit.
	* @returns The transformed page, or `null` to exclude it.
	*/
	visitPage(page) {
		const pageContext = new VisitorContext({
			type: "page",
			visitor: this.context.visitor,
			page,
			parentComponent: void 0,
			parentRegion: void 0,
			parent: void 0,
			node: page
		});
		if (this.context.visitor.visitPage) return this.context.visitor.visitPage(pageContext);
		else if (page.regions) return {
			...page,
			regions: pageContext.visitRegions(page.regions)
		};
		return page;
	}
	toChildContext(type, node) {
		VisitorContextError.assert(this.context.type, type);
		const parent = this;
		if (type === "region") return new VisitorContext({
			type: "region",
			visitor: this.context.visitor,
			page: this.page,
			node,
			parent,
			parentComponent: this.node,
			parentRegion: this.parentRegion
		});
		return new VisitorContext({
			type: "component",
			visitor: this.context.visitor,
			page: this.page,
			node,
			parent,
			parentComponent: this.parentComponent,
			parentRegion: this.node
		});
	}
};
var RootVisitorContext = class extends VisitorContext {
	constructor(visitor) {
		super({
			node: null,
			type: "root",
			visitor
		});
	}
};
/**
* Traverses a page tree using the visitor pattern, applying the visitor's
* callbacks to the page, its regions, and their nested components. This is
* the top-level entry point for page tree transformation.
*
* When a visitor handler is defined, it receives a {@link VisitorContext} and
* is responsible for traversing into children using the context's traversal
* methods (`visitRegions`, `visitComponents`). If the handler does not call
* these methods, children will not be visited. When no handler is defined for
* a node type, children are traversed automatically.
*
* Returning `null` from a `visitRegion` or `visitComponent` callback removes
* that element and its children from the resulting tree.
*
* @param page - The page to traverse.
* @param visitor - The visitor with callbacks to apply at each tree node.
* @returns A new page with visitor transformations applied, or `null`.
*
* @example
* ```ts
* import { transformPage } from '@salesforce/storefront-next-runtime/design/data';
*
* const page = { id: 'homepage', typeId: 'storePage', regions: [
*     { id: 'header', components: [
*         { id: 'hero-banner', typeId: 'commerce_assets.heroBanner', regions: [] },
*         { id: 'promo-tile', typeId: 'commerce_assets.promoTile', regions: [] },
*     ]},
* ]};
*
* // When only visitComponent is defined, regions are traversed automatically.
* // The handler receives a VisitorContext — use context.node to access the component.
* transformPage(page, {
*     visitComponent(context) {
*         console.log(`Component: ${context.node.typeId} in region ${context.parentRegion?.id}`);
*         return context.node;
*     },
* });
*
* // When visitRegion is defined, the handler must traverse into children explicitly.
* // Without calling context.visitComponents(), components inside the region are skipped.
* transformPage(page, {
*     visitRegion(context) {
*         console.log(`Entering region: ${context.node.id}`);
*         const components = context.visitComponents(context.node.components);
*         return { ...context.node, components };
*     },
*     visitComponent(context) {
*         console.log(`  Component: ${context.node.typeId}`);
*         return context.node;
*     },
* });
* ```
*/
function transformPage(page, visitor) {
	return new RootVisitorContext(visitor).visitPage(page);
}
/**
* Applies the visitor to a single component. If the visitor's `visitComponent`
* handler is defined, it receives a {@link VisitorContext} and is responsible
* for traversing into the component's nested regions using `context.visitRegions()`.
* If no `visitComponent` handler is defined, nested regions are traversed
* automatically. Returns `null` to exclude the component from the result.
*
* @param component - The component to transform.
* @param visitor - The visitor with callbacks.
* @returns The transformed component, or `null` to exclude it.
*
* @example
* ```ts
* import { transformComponent } from '@salesforce/storefront-next-runtime/design/data';
*
* // Replace the image URL in a hero banner component and traverse its nested regions
* const heroBanner = {
*     id: 'hero-1',
*     typeId: 'commerce_assets.heroBanner',
*     data: { imageUrl: '/images/summer-sale.jpg' },
*     regions: [{ id: 'banner-content', components: [] }],
* };
*
* const result = transformComponent(heroBanner, {
*     visitComponent(context) {
*         // Traverse into nested regions using the context API
*         const regions = context.visitRegions(context.node.regions);
*
*         if (context.node.typeId === 'commerce_assets.heroBanner') {
*             return { ...context.node, regions, data: { ...context.node.data, imageUrl: '/images/winter-sale.jpg' } };
*         }
*         return { ...context.node, regions };
*     },
* });
* ```
*/
function transformComponent(component, visitor) {
	return new RootVisitorContext(visitor).visitComponent(component);
}
/**
* Applies the visitor to a single region. If the visitor's `visitRegion`
* handler is defined, it receives a {@link VisitorContext} and is responsible
* for traversing into the region's child components using `context.visitComponents()`.
* If no `visitRegion` handler is defined, child components are traversed
* automatically. Returns `null` to exclude the region and all its children
* from the result.
*
* @param region - The region to transform.
* @param visitor - The visitor with callbacks.
* @returns The transformed region, or `null` to exclude it.
*
* @example
* ```ts
* import { transformRegion } from '@salesforce/storefront-next-runtime/design/data';
*
* // Filter empty regions and traverse into non-empty ones
* const emptyRegion = { id: 'sidebar', components: [] };
* const populatedRegion = { id: 'main', components: [
*     { id: 'product-grid', typeId: 'commerce_assets.productGrid', regions: [] },
* ]};
*
* const visitor = {
*     visitRegion(context) {
*         if (!context.node.components?.length) {
*             return null; // Remove empty regions
*         }
*         // Traverse into child components using the context API
*         const components = context.visitComponents(context.node.components);
*         return { ...context.node, components };
*     },
* };
*
* transformRegion(emptyRegion, visitor);      // => null (removed)
* transformRegion(populatedRegion, visitor);   // => { id: 'main', components: [...] }
* ```
*/
function transformRegion(region, visitor) {
	return new RootVisitorContext(visitor).visitRegion(region);
}

//#endregion
//#region src/design/data/page/resolve-data-bindings.ts
/**
* Pattern matching bare expressions: `type.field`.
*/
const BARE_EXPRESSION_PATTERN = /^(\w+)\.(\w+)$/;
/**
* Coerces a string value returned by the data binding API into a boolean or
* number when the contents represent one. The data provider returns every
* field as a string, so callers expecting typed values would otherwise receive
* `"true"` instead of `true` or `"2026"` instead of `2026`.
*
* Non-string inputs are returned as-is. Strings that are neither booleans nor
* finite numbers are returned unchanged.
*/
function parseFieldValue(value) {
	if (typeof value !== "string") return value;
	if (value === "true") return true;
	if (value === "false") return false;
	if (value.trim() === "") return value;
	const num = Number(value);
	if (Number.isFinite(num)) return num;
	return value;
}
/**
* Parses a binding expression string into its provider type and field name.
* Supports the bare `type.field` format.
*
* @param expression - The expression string to parse.
* @returns The parsed type and field, or `null` if the expression is invalid.
*
* @example
* ```ts
* parseExpression('content_asset.title');  // { type: 'content_asset', field: 'title' }
* parseExpression('invalid');              // null
* ```
*/
function parseExpression(expression) {
	const match = expression.trim().match(BARE_EXPRESSION_PATTERN);
	if (match) return {
		type: match[1],
		field: match[2]
	};
	return null;
}
/**
* Resolves a single binding expression against the component's data contexts
* and the resolved data bindings from context resolution.
*
* Returns the resolved field value, or an empty string if the expression is
* invalid, the matching context or record is not found, or the field does not
* exist on the resolved record.
*
* @param expression - The expression string (e.g. `"content_asset.body"`).
* @param contexts - The component's data binding contexts.
* @param dataBindings - The resolved data bindings from {@link QualifierContext}.
* @returns The resolved value, or `''` if resolution fails.
*/
function resolveExpression(expression, contexts, dataBindings) {
	const parsed = parseExpression(expression);
	if (!parsed) return "";
	const context = contexts.find((c) => c.type === parsed.type);
	if (!context) return "";
	const record = dataBindings[context.type]?.[context.id];
	if (!record) return "";
	return parseFieldValue(record[parsed.field] ?? "");
}
/**
* Resolves data binding expressions for a single component. Replaces attribute
* values in the component's `data` with the resolved values from context
* resolution. Attributes without a matching expression are preserved as-is.
* When an expression cannot be resolved, the attribute value is set to an
* empty string.
*
* Returns the component unchanged if it has no data binding metadata or if
* `dataBindings` is `undefined`.
*
* @param component - The component to resolve data bindings for.
* @param binding - The component's data binding metadata from the page manifest's `componentInfo`, or `null`/`undefined` if not bound.
* @param dataBindings - The resolved data bindings from {@link QualifierContext}, or `undefined` if no bindings were resolved.
* @returns The component with resolved attribute values, or the original component if no bindings apply.
*
* @example
* ```ts
* import { resolveComponentDataBindings } from '@salesforce/storefront-next-runtime/design/data';
*
* const component = {
*     id: 'banner',
*     typeId: 'commerce_assets.contentBanner',
*     data: { heading: 'Fallback Title', body: 'Fallback Body' },
*     regions: [],
* };
*
* const binding = {
*     expressions: {
*         heading: 'content_asset.title',
*         body: 'content_asset.body',
*     },
*     contexts: [{ type: 'content_asset', id: 'winter-sale-uuid' }],
* };
*
* const dataBindings = {
*     content_asset: {
*         'winter-sale-uuid': {
*             title: 'Winter Sale',
*             body: '<div>Free Shipping on all orders!</div>',
*         },
*     },
* };
*
* const resolved = resolveComponentDataBindings(component, binding, dataBindings);
* // resolved.data.heading === 'Winter Sale'
* // resolved.data.body === '<div>Free Shipping on all orders!</div>'
* ```
*/
function resolveComponentDataBindings(component, binding, dataBindings) {
	if (!dataBindings) return component;
	if (!binding?.contexts?.length) return component;
	const expressionEntries = Object.entries(binding.expressions ?? {});
	if (expressionEntries.length === 0) return component;
	const resolvedData = { ...component.data };
	for (const [attrName, expression] of expressionEntries) resolvedData[attrName] = resolveExpression(expression, binding.contexts, dataBindings);
	return {
		...component,
		data: resolvedData
	};
}

//#endregion
//#region src/design/data/page/markup-url-rewriter.ts
const STATICLINK_PATTERN = /\?\$staticlink\$/gi;
const STATICLINK_DELIMITERS_SINGLE = "\":='(>";
const STATICLINK_DELIMITERS_DOUBLE = [
	"\"[",
	"=[",
	",[",
	" [",
	" ,",
	", "
];
let warnedStaticlink = false;
function rewriteImages(source, ctx) {
	const domain = ctx.pageLibraryDomain;
	if (!domain) {
		if (!warnedStaticlink) {
			warnedStaticlink = true;
			ctx.onWarn?.({
				kind: "staticlink-rewrite-skipped",
				message: "?$staticlink$ rewrite skipped: ctx.pageLibraryDomain is not set",
				typeId: "",
				attrId: "",
				attrType: "markup"
			});
		}
		return source;
	}
	const resolveStaticUrl = ctx.staticLinkFor ?? ctx.resolveMediaUrl;
	let result = "";
	let lastPos = -1;
	STATICLINK_PATTERN.lastIndex = 0;
	let match = STATICLINK_PATTERN.exec(source);
	if (!match) return source;
	while (match) {
		const pos = match.index;
		const newPos = STATICLINK_PATTERN.lastIndex;
		let startPos = pos - 1;
		while (true) {
			if (startPos <= lastPos) break;
			const ch = source.charAt(startPos);
			if (STATICLINK_DELIMITERS_SINGLE.indexOf(ch) !== -1) {
				if (!(ch === "=" && startPos + 1 < source.length && source.charAt(startPos + 1) === ".")) break;
			}
			if (startPos > 0) {
				const doubleChar = source.substring(startPos - 1, startPos + 1);
				if (STATICLINK_DELIMITERS_DOUBLE.includes(doubleChar)) break;
			}
			startPos--;
		}
		const leftStart = lastPos === -1 ? 0 : lastPos;
		result += source.substring(leftStart, startPos + 1);
		const path = source.substring(startPos + 1, pos);
		if (path.trim().length !== 0) {
			let url = resolveStaticUrl({
				libraryDomain: domain,
				path: path.trim(),
				locale: ctx.locale
			});
			if (path.startsWith(" ")) url = ` ${url}`;
			if (path.endsWith(" ")) url += " ";
			result += url;
		}
		lastPos = newPos;
		match = STATICLINK_PATTERN.exec(source);
	}
	const tailStart = lastPos === -1 ? 0 : lastPos;
	result += source.substring(tailStart);
	return result;
}
/**
* Rewrites `?$staticlink$` placeholders in markup to fully-qualified
* static-content URLs. Pipeline-action placeholders pass through unchanged.
*/
function rewriteMarkup(source, ctx) {
	if (!source) return "";
	return rewriteImages(source, ctx);
}

//#endregion
//#region src/design/data/page/attribute-resolution.ts
/**
* Module-scoped dedup set for unknown-type / malformed-envelope warnings.
* Keyed by `${kind}|${typeId}|${attrId}|${attrType}` so two different
* issues on the same attribute (e.g. malformed-image then later
* unknown-type) both fire once.
*/
const warnedKeys = /* @__PURE__ */ new Set();
/**
* Routes a structured warning to the consumer's `onWarn` handler at most
* once per `(kind, typeId, attrId, attrType)` triple. When no handler is
* configured the runtime stays silent — production callers are expected to
* supply a handler.
*/
function warnOnce(ctx, kind, typeId, attrId, attrType, message) {
	if (!ctx.onWarn) return;
	const key = `${kind}|${typeId}|${attrId}|${attrType}`;
	if (warnedKeys.has(key)) return;
	warnedKeys.add(key);
	ctx.onWarn({
		kind,
		message,
		typeId,
		attrId,
		attrType
	});
}
/**
* Returns true when `value` is shaped like an {@link ImageEnvelope}. Used
* during structural dispatch (when `componentTypes` is unavailable) to
* recognize image attributes without `attrDef.type`.
*/
function isImageEnvelope(value) {
	if (!value || typeof value !== "object") return false;
	const media = value.media;
	return media != null && typeof media === "object" && typeof media.libraryDomain === "string" && typeof media.path === "string";
}
/**
* Converts an {@link ImageEnvelope} to the resolved SCAPI shape by stamping
* the URL. Returns the original value untouched if the envelope is
* malformed (missing `media.libraryDomain` or `media.path`); a warning is
* logged once per `(typeId, attrId, attrType)` triple so production logs
* don't drown.
*/
function resolveImageAttribute(value, typeId, attrId, attrType, ctx) {
	if (!isImageEnvelope(value)) {
		warnOnce(ctx, "malformed-image", typeId, attrId, attrType, "malformed image envelope, passing through unchanged");
		return value;
	}
	const out = { url: ctx.resolveMediaUrl({
		libraryDomain: value.media.libraryDomain,
		path: value.media.path,
		locale: ctx.locale
	}) };
	if (value.focalPoint) out.focalPoint = value.focalPoint;
	if (value.metaData) out.metaData = value.metaData;
	return out;
}
function isFileEnvelope(value) {
	if (!value || typeof value !== "object") return false;
	const candidate = value;
	const media = candidate.media;
	return media != null && typeof media === "object" && typeof media.libraryDomain === "string" && typeof media.path === "string" && !("focalPoint" in candidate || "metaData" in candidate);
}
/**
* Resolves a file envelope to a URL string. Matches SCAPI's
* `mediaFile.getAbsURL().toString()` — file attributes emit a plain URL
* string, not an object envelope.
*/
function resolveFileAttribute(value, typeId, attrId, ctx) {
	if (!isFileEnvelope(value)) {
		warnOnce(ctx, "malformed-file", typeId, attrId, "file", "malformed file envelope, passing through unchanged");
		return value;
	}
	return ctx.resolveMediaUrl({
		libraryDomain: value.media.libraryDomain,
		path: value.media.path,
		locale: ctx.locale
	});
}
const MAX_CMS_RECORD_DEPTH = 10;
function isCmsRecordEnvelope(value) {
	if (!value || typeof value !== "object") return false;
	const candidate = value;
	if (typeof candidate.id !== "string") return false;
	const type = candidate.type;
	if (!type || typeof type !== "object" || typeof type.id !== "string") return false;
	if (!Array.isArray(type.attributeDefinitions)) return false;
	return candidate.attributes != null && typeof candidate.attributes === "object";
}
function resolveCmsRecordAttribute(value, typeId, attrId, ctx, depth) {
	if (value == null) return value;
	if (!isCmsRecordEnvelope(value)) {
		warnOnce(ctx, "malformed-cms-record", typeId, attrId, "cms_record", "malformed cms_record envelope, passing through unchanged");
		return value;
	}
	if (depth >= MAX_CMS_RECORD_DEPTH) {
		warnOnce(ctx, "cms-record-depth-exceeded", typeId, attrId, "cms_record", `cms_record nesting depth exceeded (max ${MAX_CMS_RECORD_DEPTH}), passing through unchanged`);
		return value;
	}
	const innerDefs = value.type.attributeDefinitions;
	const resolvedAttrs = resolveCmsRecordInnerAttributes(value.attributes, typeId, innerDefs, ctx, depth + 1);
	return {
		id: value.id,
		type: value.type,
		attributes: resolvedAttrs
	};
}
function resolveCmsRecordInnerAttributes(data, typeId, defs, ctx, depth) {
	const out = {};
	const defsById = /* @__PURE__ */ new Map();
	for (const def of defs) defsById.set(def.id, def);
	for (const [attrId, value] of Object.entries(data)) {
		const def = defsById.get(attrId);
		if (!def) {
			out[attrId] = value;
			continue;
		}
		out[attrId] = dispatchCmsRecordInner(value, typeId, attrId, def, ctx, depth);
	}
	return out;
}
function dispatchCmsRecordInner(value, typeId, attrId, attrDef, ctx, depth) {
	if (attrDef.type === "cms_record") return resolveCmsRecordAttribute(value, typeId, attrId, ctx, depth);
	return dispatchByType(value, typeId, attrId, attrDef, ctx);
}
/**
* Resolves every attribute on a component's `data` map to the wire shape
* SCAPI `getPage` would have returned.
*
* Dispatch is type-driven when {@code typeAttributeDefinitions} is supplied.
* Otherwise the resolver inspects each value structurally — it recognizes
* the image envelope by the presence of `media.libraryDomain` and
* `media.path` and passes everything else through unchanged.
*
* Forward-compatibility (Q9): unknown attribute types pass through. Each
* `(typeId, attrId, attrType)` triple is logged once per process via a
* module-scoped dedup set.
*
* @param data                      attribute map to resolve, already
*                                  locale-merged + data-binding-resolved by
*                                  {@link processPage}.
* @param typeId                    component type identifier, used as part
*                                  of the dedup key for warnings. Empty
*                                  string is acceptable for anonymous
*                                  callers (page-level data).
* @param typeAttributeDefinitions  attribute definitions for {@code typeId}
*                                  from `manifest.componentTypes`. When
*                                  omitted, falls back to structural
*                                  detection of the image envelope.
* @param ctx                       per-request resolution surface.
* @returns a new map with each attribute's value replaced by the resolved
*          wire shape; pass-through for any attribute type the resolver
*          doesn't yet recognize.
*/
function resolveAttributeValues(data, typeId, typeAttributeDefinitions, ctx) {
	if (!data) return {};
	const out = {};
	if (typeAttributeDefinitions && Object.keys(typeAttributeDefinitions).length > 0) {
		for (const [attrId, value] of Object.entries(data)) {
			const def = typeAttributeDefinitions[attrId];
			if (!def) {
				out[attrId] = value;
				continue;
			}
			out[attrId] = dispatchByType(value, typeId, attrId, def, ctx);
		}
		return out;
	}
	for (const [attrId, value] of Object.entries(data)) if (isImageEnvelope(value)) out[attrId] = resolveImageAttribute(value, typeId, attrId, "image", ctx);
	else out[attrId] = value;
	return out;
}
/**
* Type-driven dispatch. Unknown types fall through with a deduped warning
* (Q9) — the principle is that a runtime older than ECOM should still
* produce *something* rather than dropping the value.
*/
function dispatchByType(value, typeId, attrId, attrDef, ctx) {
	switch (attrDef.type) {
		case "image": return resolveImageAttribute(value, typeId, attrId, attrDef.type, ctx);
		case "markup": return typeof value === "string" ? rewriteMarkup(value, ctx) : value;
		case "file": return resolveFileAttribute(value, typeId, attrId, ctx);
		case "cms_record": return resolveCmsRecordAttribute(value, typeId, attrId, ctx, 0);
		case "string":
		case "text":
		case "url":
		case "boolean":
		case "integer":
		case "enum":
		case "custom":
		case "product":
		case "category":
		case "page": return value;
		default:
			warnOnce(ctx, "unknown-attribute-type", typeId, attrId, attrDef.type, "unknown attribute type, passing through unchanged");
			return value;
	}
}

//#endregion
//#region src/design/data/validate-rule.ts
/**
* Evaluates a visibility rule against a shopper's qualifier context.
*
* Campaign-based and non-campaign rules are **mutually exclusive** paths,
* matching the server's `VisibilityDefinition.isVisible()` logic:
*
* - **Campaign-based rule** (has `campaignQualifiers`): only the campaign
*   qualifiers are checked. Schedule, locale, and customer-group fields are
*   ignored because the campaign qualification already incorporates those
*   checks server-side.
* - **Non-campaign rule**: locale, schedule, AND customer groups are checked.
*   All specified conditions must pass.
*
* When no context is provided and the rule requires campaign or customer group
* checks, those checks will fail (returning `false`). Schedule checks do not
* require context and are evaluated against `Date.now()`.
*
* @param rule - The visibility rule to evaluate.
* @param locale - The current locale (e.g. `"en_US"`). Used to check whether the rule applies to this locale.
* @param context - The shopper's active qualifiers, or `null`/`undefined` if not yet resolved.
* @returns `true` if the rule's conditions pass, `false` otherwise.
*
* @example
* ```ts
* import { validateRule } from '@salesforce/storefront-next-runtime/design/data';
*
* // Campaign-based rule — only campaign qualifiers are evaluated
* const campaignRule = {
*     activeLocales: ['en_US'],
*     campaignQualifiers: [{ campaignId: 'holiday-sale-2026', promotionId: 'free-shipping' }],
* };
*
* // Non-campaign rule — locale, schedule AND customer groups are evaluated
* const segmentRule = {
*     activeLocales: ['en_US', 'fr_FR'],
*     customerGroups: ['vip-customers'],
*     schedule: {
*         start: new Date('2026-12-01').toISOString(),
*         end: new Date('2026-12-31').toISOString(),
*     },
* };
* ```
*/
function validateRule(rule, locale, context) {
	if (rule.campaignQualifiers?.length) {
		for (const campaignQualifier of rule.campaignQualifiers) if (!(campaignQualifier.promotionId !== void 0 ? context?.campaignQualifiers?.[campaignQualifier.campaignId]?.[campaignQualifier.promotionId] : context?.campaigns?.[campaignQualifier.campaignId])) return false;
	} else {
		if (rule.activeLocales && !rule.activeLocales.includes(locale)) return false;
		if (rule.schedule) {
			const now = Date.now();
			if (rule.schedule.start) {
				const startTimeInMillis = new Date(rule.schedule.start).getTime();
				if (Number.isNaN(startTimeInMillis) || startTimeInMillis >= now) return false;
			}
			if (rule.schedule.end) {
				const endTimeInMillis = new Date(rule.schedule.end).getTime();
				if (Number.isNaN(endTimeInMillis) || endTimeInMillis <= now) return false;
			}
		}
		if (rule.customerGroups) {
			for (const customerGroup of rule.customerGroups) if (!context?.customerGroups?.[customerGroup]) return false;
		}
	}
	return true;
}

//#endregion
//#region src/design/data/page/process-page.ts
/**
* Filters content components based on their visibility rules and resolves
* data binding expressions in a single traversal. Handles both page-rooted
* trees (a {@link ShopperExperience.schemas#Page} from a {@link PageManifest})
* and component-rooted trees (a {@link ShopperExperience.schemas#Component}
* from a {@link ComponentManifest}). The visitor logic is identical for both;
* only the root entry point differs.
*
* 1. Removes any component whose visibility rules do not pass against the
*    shopper's qualifier context.
* 2. Resolves data binding expressions in each surviving component's `data`
*    attributes using the resolved data bindings from context resolution.
*
* A component is visible if **any** of its visibility rules pass (OR logic).
* If a component has rules and none of them pass, it is removed. Components
* without rules are always included.
*
* @param node - The root page or component to process.
* @param context - The processing context with qualifier data, visibility rules, and resolved data bindings.
* @returns A new page or component (matching the input shape) with invisible components filtered out and data binding expressions resolved.
*
* @example
* ```ts
* import { processPage } from '@salesforce/storefront-next-runtime/design/data';
*
* const page = {
*     id: 'homepage',
*     typeId: 'storePage',
*     regions: [{
*         id: 'main',
*         components: [
*             { id: 'public-banner', typeId: 'commerce_assets.heroBanner', regions: [] },
*             { id: 'loyalty-offer', typeId: 'commerce_assets.promoTile', regions: [] },
*         ],
*     }],
* };
*
* // The "loyalty-offer" component requires the shopper to be in "loyalty-members"
* const componentInfo = {
*     'public-banner': { visibilityRules: [] },
*     'loyalty-offer': {
*         visibilityRules: [{ customerGroups: ['loyalty-members'] }],
*     },
* };
*
* // Guest shopper — not in any customer group
* const filtered = processPage(page, {
*     qualifiers: { customerGroups: {}, campaignQualifiers: {} },
*     componentInfo,
*     pageInfo: { regions: {} },
*     locale: 'en_US',
*     defaultLocale: 'en_US',
*     attrCtx,
* });
* // filtered.regions[0].components has only "public-banner"
* // "loyalty-offer" was removed because the shopper isn't a loyalty member
* ```
*/
/**
* Builds a component's `data` map by walking each attribute definition and
* picking the first non-undefined value in priority order:
*
*   active-locale content → fallback content → attrDef.defaultValue
*
* The fallback bucket is selected whole-blob style (matching SCAPI/SFRA's
* `__data` resolution): the site-default-locale bucket if it carries any
* content, otherwise the literal-default ("default") bucket. Buckets are not
* per-key merged with each other — only the active-locale bucket layers
* per-key on top of the chosen fallback (preserving today's locale override
* semantics).
*
* If none of those have a value the attribute is omitted from the result.
*
* When no `typeDefs` are supplied, we fall back to the legacy behavior:
* `{ ...nodeData, ...fallbackContent, ...localeContent }`. This keeps
* already-deployed manifests rendering until the manifest builder starts
* emitting `componentTypes`.
*/
function composeComponentData({ nodeData, literalDefaultContent, defaultContent, localeContent, typeDefs }) {
	const fallbackContent = Object.keys(defaultContent).length > 0 ? defaultContent : literalDefaultContent;
	if (!typeDefs || Object.keys(typeDefs).length === 0) return {
		...nodeData ?? {},
		...fallbackContent,
		...localeContent
	};
	const result = {};
	for (const attrId of Object.keys(typeDefs)) {
		const def = typeDefs[attrId];
		if (Object.prototype.hasOwnProperty.call(localeContent, attrId)) result[attrId] = localeContent[attrId];
		else if (Object.prototype.hasOwnProperty.call(fallbackContent, attrId)) result[attrId] = fallbackContent[attrId];
		else if (def.defaultValue !== void 0) result[attrId] = def.defaultValue;
	}
	return result;
}
function processPage(node, processorContext) {
	const { pruneInvisible = true } = processorContext;
	const visitor = {
		visitPage(ctx) {
			const pageNode = ctx.node;
			const result = {
				...pageNode,
				regions: ctx.visitRegions(pageNode.regions)
			};
			if (pageNode.data !== void 0) {
				const typeDefs = processorContext.componentTypes?.[pageNode.typeId]?.attributeDefinitions;
				result.data = resolveAttributeValues(pageNode.data, pageNode.typeId, typeDefs, processorContext.attrCtx);
			}
			return result;
		},
		visitRegion(ctx) {
			let regionInfo;
			if (ctx.parent?.type === "page") regionInfo = processorContext.pageInfo?.regions[ctx.node.id];
			else if (ctx.parent?.type === "component") regionInfo = processorContext.componentInfo[ctx.parent.node.id]?.regions?.[ctx.node.id];
			let components = ctx.visitComponents(ctx.node.components);
			if (regionInfo?.maxComponents != null) if (pruneInvisible) components = components.slice(0, regionInfo.maxComponents);
			else {
				const result = [];
				let visibleCount = 0;
				for (const comp of components) {
					if (comp.visible) visibleCount++;
					if (visibleCount > regionInfo.maxComponents) result.push({
						...comp,
						visible: false
					});
					else result.push(comp);
				}
				components = result;
			}
			return {
				...ctx.node,
				components
			};
		},
		visitComponent(ctx) {
			const componentInfo = processorContext.componentInfo[ctx.node.id];
			const visibilityRules = componentInfo?.visibilityRules ?? [];
			let isVisible = true;
			if (visibilityRules.length > 0) {
				if (!visibilityRules.some((rule) => validateRule(rule, processorContext.locale, processorContext.qualifiers))) {
					if (pruneInvisible) return null;
					isVisible = false;
				}
			}
			const literalDefaultContent = componentInfo?.content?.default ?? {};
			const defaultContent = componentInfo?.content?.[processorContext.defaultLocale] ?? {};
			const localeContent = componentInfo?.content?.[processorContext.locale] ?? {};
			const isLocalized = Boolean(componentInfo?.content?.[processorContext.locale]);
			const typeDefs = processorContext.componentTypes?.[ctx.node.typeId]?.attributeDefinitions;
			const composedData = composeComponentData({
				nodeData: ctx.node.data,
				literalDefaultContent,
				defaultContent,
				localeContent,
				typeDefs
			});
			const name = componentInfo?.name ?? ctx.node.name;
			const fragment = componentInfo?.fragment ?? ctx.node.fragment ?? false;
			let resolved = {
				...ctx.node,
				name,
				fragment,
				localized: isLocalized,
				visible: isVisible,
				data: composedData
			};
			resolved = resolveComponentDataBindings(resolved, componentInfo?.dataBinding, processorContext.qualifiers?.dataBindings);
			const resolvedData = resolveAttributeValues(resolved.data, resolved.typeId, typeDefs, processorContext.attrCtx);
			resolved = {
				...resolved,
				data: resolvedData
			};
			return {
				...resolved,
				regions: ctx.visitRegions(ctx.node.regions)
			};
		}
	};
	if ((processorContext.kind ?? "page") === "page") return transformPage(node, visitor);
	return transformComponent(node, visitor);
}

//#endregion
//#region src/design/data/errors/required.ts
/**
* Copyright 2026 Salesforce, Inc.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
var RequiredError = class RequiredError extends Error {
	constructor(message) {
		super(message);
		this.name = "RequiredError";
	}
	static assert(value, message, isEmpty = (v) => v == null) {
		if (isEmpty(value)) throw new RequiredError(message);
	}
};

//#endregion
//#region src/design/data/manifest/content-assignment-resolvers.ts
/**
* Registry of content assignment resolvers keyed by {@link IdentifierType}.
* Each resolver knows how to convert its identifier type into a set of lookup
* keys for the site manifest.
*
* Built-in resolvers:
* - **`'product'`** — Maps a product ID to a single PDP lookup key.
* - **`'category'`** — Maps a category ID to an ordered list of keys that
*   traverses the category hierarchy from child to root, enabling inherited
*   page assignments.
*
* The `'page'` identifier type has no resolver — page IDs are used directly.
*
* @example
* ```ts
* import { ContentAssignmentResolvers } from '@salesforce/storefront-next-runtime/design/data';
*
* // Resolve a product identifier for PDP lookup
* const productResolver = ContentAssignmentResolvers.get('product');
* productResolver('nike-air-max-90');
* // => { objectType: 'product', aspectType: 'pdp', keys: ['nike-air-max-90'] }
*
* // Resolve a category identifier — traverses hierarchy to find inherited assignments
* const categoryResolver = ContentAssignmentResolvers.get('category');
* const siteManifest = {
*     categories: {
*         'mens-running-shoes': { name: 'Running Shoes', parentCategory: 'mens-shoes' },
*         'mens-shoes': { name: "Men's Shoes", parentCategory: 'mens' },
*         'mens': { name: 'Men' },
*     },
*     contentObjectAssignments: {},
* };
* categoryResolver('mens-running-shoes', siteManifest);
* // => { objectType: 'category', aspectType: 'plp', keys: ['mens-running-shoes', 'mens-shoes', 'mens'] }
* ```
*/
const ContentAssignmentResolvers = new Map([["product", (key) => ({
	objectType: "product",
	keys: [key]
})], ["category", (key, manifest) => {
	const keys = [];
	const visited = /* @__PURE__ */ new Set();
	let currentCategoryId = key;
	while (currentCategoryId && !visited.has(currentCategoryId)) {
		visited.add(currentCategoryId);
		keys.push(currentCategoryId);
		currentCategoryId = manifest?.categories[currentCategoryId]?.parentCategory;
	}
	return {
		objectType: "category",
		keys
	};
}]]);

//#endregion
//#region src/design/data/manifest/resolve-dynamic-page-id.ts
/**
* Looks up a single content assignment in the site manifest using the
* resolver registered for the given identifier type, returning the first
* matching `contentId` across the resolver's ordered key list. Returns
* `null` when the identifier type has no resolver, or no key in the list
* has an assignment for the requested aspect type.
*/
function lookupContentAssignment(id, identifierType, aspectType, siteManifest) {
	const lookup = ContentAssignmentResolvers.get(identifierType)?.(id, siteManifest);
	if (!lookup) return null;
	for (const key of lookup.keys) {
		const assignment = siteManifest?.contentObjectAssignments?.[aspectType]?.[lookup.objectType]?.[key];
		if (assignment) return assignment.contentId;
	}
	return null;
}
/**
* Converts a product or category identifier into a page ID by looking up
* content assignments in the site manifest. For categories, the lookup
* traverses the category hierarchy from the given category up to the root,
* returning the first matching assignment.
*
* When the identifier type is `'product'` and no assignment is found, an
* optional `categoryId` may be supplied as a fallback. The fallback is only
* awaited and consulted after the product lookup misses, so callers that
* resolve the product's category lazily (e.g. via a SCAPI request) don't
* pay for the round trip on the happy path.
*
* Returns `null` if no content assignment is found for the identifier
* (and the optional category fallback, when provided), or if the identifier
* type has no registered resolver.
*
* @param options - The resolution options.
* @param options.id - The identifier to resolve (product ID, category ID, or page ID).
* @param options.identifierType - The type of identifier: `'product'`, `'category'`, or `'page'`.
* @param options.aspectType - The aspect type to look up (e.g. `'pdp'`, `'plp'`).
* @param options.siteManifest - The site manifest containing content assignments and category hierarchy.
* @param options.categoryId - Optional fallback category ID (or a Promise resolving to one) used only when `identifierType` is `'product'` and the product lookup misses.
* @returns The resolved page ID, or `null` if no assignment was found.
*
* @example
* ```ts
* import { resolveDynamicPageId } from '@salesforce/storefront-next-runtime/design/data';
*
* const siteManifest = {
*     contentObjectAssignments: {
*         plp: {
*             category: {
*                 'mens-shoes': {
*                     lookupMode: 'category-explicit',
*                     contentId: 'page-mens-shoes-plp',
*                 },
*             },
*         },
*     },
*     categories: {
*         'mens-running-shoes': { name: 'Running Shoes', parentCategory: 'mens-shoes' },
*         'mens-shoes': { name: "Men's Shoes" },
*     },
* };
*
* // Direct match
* await resolveDynamicPageId({ id: 'mens-shoes', identifierType: 'category', aspectType: 'plp', siteManifest });
* // => 'page-mens-shoes-plp'
*
* // Inherited from parent category
* await resolveDynamicPageId({ id: 'mens-running-shoes', identifierType: 'category', aspectType: 'plp', siteManifest });
* // => 'page-mens-shoes-plp' (found via parent traversal)
*
* // Product missing but a category fallback is provided
* await resolveDynamicPageId({
*     id: 'unknown-product',
*     identifierType: 'product',
*     aspectType: 'plp',
*     siteManifest,
*     categoryId: 'mens-running-shoes',
* });
* // => 'page-mens-shoes-plp'
* ```
*/
async function resolveDynamicPageId({ id, identifierType, siteManifest, aspectType, categoryId }) {
	const direct = lookupContentAssignment(id, identifierType, aspectType, siteManifest);
	if (direct) return direct;
	if (identifierType !== "product" || categoryId == null) return null;
	const resolvedCategoryId = await categoryId;
	if (!resolvedCategoryId) return null;
	return lookupContentAssignment(resolvedCategoryId, "category", aspectType, siteManifest);
}

//#endregion
//#region src/design/data/manifest/get-page.ts
/**
* Selects the appropriate page variation from a manifest by evaluating each
* variation's visibility rule in order. Returns the first variation whose rule
* passes, or falls back to the manifest's default variation.
*
* The qualifier context is resolved lazily — the `contextResolver` is only
* called when a variation's `ruleRequiresContext` flag is `true`, and only
* once (the result is cached for subsequent variations).
*
* @param manifest - The page manifest containing all variations.
* @param options - Resolution options.
* @param options.contextResolver - Optional async function that returns the shopper's qualifier context. Only called if a variation's rule needs it.
* @param options.locale - The current locale (e.g. `"en_US"`). Used to evaluate locale-based visibility rules.
* @returns The selected variation entry and resolved context, or `null` if no variation (including default) exists.
*
* @example
* ```ts
* import { getPageFromManifest } from '@salesforce/storefront-next-runtime/design/data';
*
* const manifest = {
*     pageId: 'homepage',
*     context: { campaignQualifiers: [], customerGroups: ['vip-customers'], dataBindings: [] },
*     variationOrder: ['vip-homepage', 'holiday-homepage'],
*     variations: {
*         'vip-homepage': {
*             ruleRequiresContext: true,
*             pageRequiresContext: false,
*             visibilityRule: { activeLocales: ['en-US'], customerGroups: ['vip-customers'] },
*             page: { id: 'homepage', typeId: 'storePage', regions: [] },
*             regions: {},
*         },
*         'holiday-homepage': {
*             ruleRequiresContext: false,
*             pageRequiresContext: false,
*             visibilityRule: {
*                 activeLocales: ['en-US'],
*                 schedule: {
*                     start: new Date('2026-12-01').toISOString(),
*                     end: new Date('2026-12-31').toISOString(),
*                 },
*             },
*             page: { id: 'homepage', typeId: 'storePage', regions: [] },
*             regions: {},
*         },
*         'default-homepage': {
*             ruleRequiresContext: false,
*             pageRequiresContext: false,
*             page: { id: 'homepage', typeId: 'storePage', regions: [] },
*             regions: {},
*         },
*     },
*     defaultVariation: 'default-homepage',
*     componentInfo: {},
* };
*
* // VIP shopper — matches first variation
* const result = await getPageFromManifest(manifest, {
*     locale: 'en-US',
*     contextResolver: async () => ({
*         customerGroups: { 'vip-customers': true },
*         campaignQualifiers: {},
*     }),
* });
* // result.entry === manifest.variations['vip-homepage']
*
* // Non-VIP shopper outside holiday window — falls back to default
* const fallback = await getPageFromManifest(manifest, {
*     locale: 'en-US',
*     contextResolver: async () => ({
*         customerGroups: {},
*         campaignQualifiers: {},
*     }),
* });
* // fallback.entry === manifest.variations['default-homepage']
* ```
*/
async function getPageFromManifest(manifest, { contextResolver, locale }) {
	let context = null;
	let resolvedVariation = null;
	for (const variationId of manifest.variationOrder) {
		const variation = manifest.variations[variationId];
		if (variation?.ruleRequiresContext && !context) context = await contextResolver?.(manifest.context) ?? null;
		if (!variation?.visibilityRule || validateRule(variation.visibilityRule, locale, context)) {
			resolvedVariation = variation;
			break;
		}
	}
	if (!resolvedVariation) resolvedVariation = manifest.variations[manifest.defaultVariation];
	if (!resolvedVariation) return null;
	return {
		entry: resolvedVariation,
		context
	};
}

//#endregion
//#region src/design/data/page/resolve-page.ts
/**
* Page metadata fields the manifest builder may locale-overlay. Used by
* {@link applyPageMetadataOverlay} to know which keys to copy from the
* overlay onto the resolved page; structural fields like `id`, `typeId`,
* and `regions` are intentionally excluded.
*/
const PAGE_METADATA_OVERLAY_KEYS = [
	"name",
	"aspectTypeId",
	"description",
	"pageTitle",
	"pageDescription",
	"pageKeywords"
];
/**
* Applies a per-locale page metadata overlay to the variation's default-locale
* page. The overlay is a **full replacement** for the listed metadata fields
* — when a key is present in the overlay it wins; when absent we fall through
* to the default-locale value (Q6 of the design plan).
*
* Returns a shallow copy of the page with overlaid fields applied. Structural
* fields (`id`, `typeId`, `regions`, `data`) are never touched.
*/
function applyPageMetadataOverlay(variation, locale) {
	const overlay = variation.pageContent?.[locale];
	if (!overlay) return variation.page;
	const out = { ...variation.page };
	for (const key of PAGE_METADATA_OVERLAY_KEYS) if (overlay[key] !== void 0) out[key] = overlay[key];
	return out;
}
async function resolvePage(options) {
	if (options.identifierType === "component") return resolveComponentFlow(options);
	return resolvePageFlow(options);
}
/**
* Resolves an embedded component (`embedded.*`) directly from a
* {@link ComponentManifest}. Skips the assignment lookup and variation
* selection that pages need — embedded components are keyed by id and have
* no page-level variations. The qualifier context is only resolved when the
* manifest's pre-computed `requiresContext` flag is `true`.
*/
async function resolveComponentFlow({ id, locale, defaultLocale, manifestStorage, contextResolver, attrCtx, pruneInvisible = true }) {
	const componentManifest = await manifestStorage.getComponentManifest(id);
	if (!componentManifest) return null;
	let context = null;
	if (componentManifest.requiresContext) context = await contextResolver?.(componentManifest.context) ?? null;
	return processPage(componentManifest.component, {
		kind: "component",
		qualifiers: context,
		componentInfo: componentManifest.componentInfo,
		locale,
		defaultLocale,
		attrCtx,
		pruneInvisible
	});
}
/**
* Page-rooted resolution flow shared by `'page' | 'category' | 'product'`
* identifier types. Resolves a dynamic page id through site content assignments
* where applicable, loads the page manifest, selects the variation matching the
* shopper's qualifier context, applies the per-locale metadata overlay, and
* returns a SCAPI Page — or `null` when the id can't be resolved, the manifest
* is missing, or no variation qualifies.
*/
async function resolvePageFlow({ id, identifierType, aspectType, categoryId, locale, defaultLocale, manifestStorage, contextResolver, attrCtx, pruneInvisible = true }) {
	let resolvedId = null;
	if (ContentAssignmentResolvers.has(identifierType)) {
		const siteManifest = await manifestStorage.getSiteManifest();
		RequiredError.assert(aspectType, `Aspect type is required for identifier type ${identifierType}`, (v) => !v);
		resolvedId = await resolveDynamicPageId({
			id,
			identifierType,
			aspectType,
			siteManifest,
			categoryId
		});
	} else resolvedId = id;
	if (!resolvedId) return null;
	const pageManifest = await manifestStorage.getPageManifest(resolvedId);
	if (!pageManifest) return null;
	const pageResults = await getPageFromManifest(pageManifest, {
		contextResolver,
		locale
	});
	if (!pageResults) return null;
	let context = null;
	if (pageResults.entry.pageRequiresContext) context = pageResults.context ?? await contextResolver?.(pageManifest.context) ?? null;
	const localizedPage = applyPageMetadataOverlay(pageResults.entry, locale);
	const resolvedAttrCtx = pageManifest.pageLibraryDomain && !attrCtx.pageLibraryDomain ? {
		...attrCtx,
		pageLibraryDomain: pageManifest.pageLibraryDomain
	} : attrCtx;
	return processPage(localizedPage, {
		kind: "page",
		qualifiers: context,
		componentInfo: pageManifest.componentInfo,
		pageInfo: { regions: pageResults.entry.regions },
		locale,
		defaultLocale,
		attrCtx: resolvedAttrCtx,
		componentTypes: pageManifest.componentTypes,
		pruneInvisible
	});
}

//#endregion
export { RequiredError, processPage, resolvePage, transformComponent, transformPage, transformRegion, validateRule };
//# sourceMappingURL=design-data.js.map