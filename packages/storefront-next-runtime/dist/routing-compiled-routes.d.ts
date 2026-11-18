import * as react_router0 from "react-router";

//#region src/routing/compiled-routes.d.ts
/** SDK-owned metadata contract, independent of React Router's private manifest. */
interface CompiledRouteMetadata {
  id: string;
  parentId?: string;
  path?: string;
  index?: boolean;
  caseSensitive?: boolean;
  isDocument: boolean;
}
/** Treat route records as immutable; replace their identity when metadata changes. */
type CompiledRoutes = Readonly<Record<string, CompiledRouteMetadata>>;
interface CompiledRouteManifest {
  routes: CompiledRoutes;
}
/** Match the compiled tree using React Router's public ranking, decoding and basename rules. */
declare function matchCompiledRoute(routes: CompiledRoutes, pathname: string, basename?: string): {
  metadata: CompiledRouteMetadata;
  params: react_router0.Params<string>;
} | null;
//#endregion
export { CompiledRouteManifest, CompiledRouteMetadata, CompiledRoutes, matchCompiledRoute };
//# sourceMappingURL=routing-compiled-routes.d.ts.map