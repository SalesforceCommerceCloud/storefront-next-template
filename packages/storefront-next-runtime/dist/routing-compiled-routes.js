import { matchRoutes } from "react-router";

//#region src/routing/compiled-routes.ts
const trees = /* @__PURE__ */ new WeakMap();
function getTree(routes) {
	const cached = trees.get(routes);
	if (cached) return cached;
	const children = /* @__PURE__ */ new Map();
	const entries = Object.values(routes);
	for (const entry of entries) if (!children.has(entry.parentId)) children.set(entry.parentId, []);
	for (const entry of entries) {
		const common = {
			id: entry.id,
			path: entry.path,
			caseSensitive: entry.caseSensitive
		};
		const route = entry.index ? {
			...common,
			index: true
		} : {
			...common,
			children: children.get(entry.id)
		};
		children.get(entry.parentId)?.push(route);
	}
	const tree = children.get(void 0) ?? [];
	trees.set(routes, tree);
	return tree;
}
/** Match the compiled tree using React Router's public ranking, decoding and basename rules. */
function matchCompiledRoute(routes, pathname, basename = "/") {
	const winner = matchRoutes(getTree(routes), pathname, basename)?.at(-1);
	if (!winner?.route.id) return null;
	return {
		metadata: routes[winner.route.id],
		params: winner.params
	};
}

//#endregion
export { matchCompiledRoute };
//# sourceMappingURL=routing-compiled-routes.js.map