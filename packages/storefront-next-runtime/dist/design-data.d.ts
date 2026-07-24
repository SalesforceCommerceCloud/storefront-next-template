import { r as ShopperExperience } from "./types2.js";

//#region src/design/data/page/attribute-resolution.d.ts

/**
 * Per-request resolution surface. Storefront-next builds one of these from
 * the request URL + site config; Page Designer preview builds one against
 * the BM origin. Both surfaces inject URL-building utilities so this module
 * stays platform-neutral.
 */
interface AttributeResolutionContext {
  /**
   * Storefront origin used to absolutize URLs, e.g.
   * `"https://www.shop.example"`. Page Designer preview supplies the BM
   * origin instead.
   */
  host: string;
  /**
   * Builds a static-content URL for a media-file path inside a library.
   * Mirrors ECOM's `MediaFile.getAbsURL()` chain, parameterized by the
   * storefront request rather than a JVM `Request`.
   *
   * The {@code locale} hint is optional — when omitted, the resolver
   * substitutes `"default"` so URLs still resolve.
   */
  resolveMediaUrl: (ref: {
    libraryDomain: string;
    path: string;
    locale?: string;
  }) => string;
  /**
   * Resolves a library-relative path inside markup (`?$staticlink$`).
   * When omitted, falls back to {@link resolveMediaUrl}.
   */
  staticLinkFor?: (ref: {
    libraryDomain: string;
    path: string;
    locale?: string;
  }) => string;
  /**
   * Default library media domain used when rewriting `?$staticlink$`
   * references inside markup attributes. Sourced from
   * {@code manifest.pageLibraryDomain} and threaded through by the
   * caller. Optional — when omitted, `?$staticlink$` placeholders inside
   * markup are left untouched and a one-time warning fires.
   */
  pageLibraryDomain?: string;
  /**
   * Locale hint forwarded to {@link resolveMediaUrl}. Page Designer
   * preview may omit this when the editor session has no locale; the
   * resolver substitutes `"default"` in that case.
   */
  locale?: string;
  /**
   * Optional handler invoked when the resolver encounters a recoverable
   * problem — malformed envelopes, unknown attribute types, depth limits
   * exceeded. Lets the consumer route these into its own logger / metric
   * pipeline instead of the SDK calling `console.warn` directly.
   *
   * The runtime dedupes calls to {@code onWarn} per
   * `(typeId, attrId, attrType)` triple so a misshapen value processed
   * many times only fires the handler once per process.
   *
   * When omitted the runtime stays silent — fits unit tests and Page
   * Designer preview where stderr noise is undesirable. Production
   * callers should supply a handler that forwards to their structured
   * logger.
   */
  onWarn?: (warning: AttributeResolutionWarning) => void;
}
/**
 * Payload passed to {@link AttributeResolutionContext.onWarn}. Keep this
 * shape stable — consumers may pattern-match on `kind` to decide log
 * level, attach extra metadata, etc.
 */
interface AttributeResolutionWarning {
  /**
   * Identifier for the kind of issue, useful for routing or grouping in
   * downstream logging:
   *
   * - `malformed-image` / `malformed-file` / `malformed-cms-record` —
   *   the manifest envelope didn't match the expected shape and the
   *   value is being passed through unchanged.
   * - `unknown-attribute-type` — the runtime saw an attribute type it
   *   doesn't recognize (forward-compat from a newer ECOM).
   * - `cms-record-depth-exceeded` — recursive cms_record nesting hit
   *   the resolver's safety limit.
   * - `staticlink-rewrite-skipped` — markup contains `?$staticlink$`
   *   placeholders but `ctx.pageLibraryDomain` was not configured, so
   *   the placeholder is left in the source. Fires once per process
   *   regardless of how many markup attributes hit it (tracked via the
   *   {@code typeId}/{@code attrId} fields, both empty strings, in the
   *   {@code warnOnce} dedup key).
   */
  kind: 'malformed-image' | 'malformed-file' | 'malformed-cms-record' | 'cms-record-depth-exceeded' | 'unknown-attribute-type' | 'staticlink-rewrite-skipped';
  /** Human-readable message — safe to log directly. */
  message: string;
  /** Component type id the offending attribute belongs to. */
  typeId: string;
  /** Attribute id within the component. */
  attrId: string;
  /** The attribute's declared type, when known. Empty for inner cms_record entries that don't carry a type. */
  attrType: string;
}
/**
 * Slim attribute definition used by the resolver to dispatch by type.
 * Mirrors the fields {@code AttributeDefinition} ships in SCAPI's
 * `componentTypes` map. Defined here so the resolver doesn't take a
 * dependency on the larger SCAPI generated types.
 */
interface AttributeDefinition {
  /** Attribute identifier as authored by the merchant (e.g. `"hero"`). */
  id: string;
  /**
   * Lower-case attribute type identifier matching ECOM's
   * {@code AttributeDefinition.Type#getID}. Examples:
   * `"string"`, `"text"`, `"image"`, `"markup"`, `"file"`, `"cms_record"`.
   */
  type: string;
  /**
   * Default value declared on the attribute definition. Used by component
   * data composition as a fallback when neither the active locale nor the
   * fallback locale has a value for this attribute (see
   * {@code processPage}'s `visitComponent`). The shape is whatever the
   * attribute's `type` would normally hold — a string for `string`/`text`,
   * an envelope for `image`/`file`, etc.
   */
  defaultValue?: unknown;
}
//#endregion
//#region src/design/data/types.d.ts

/**
 * Per-component metadata extracted from a Page Designer manifest, keyed by
 * component ID inside {@link Manifest.componentInfo}. Carries visibility rules,
 * locale-specific content overlays, data bindings, fragment marker, custom
 * serializer output, and per-region configuration for the component.
 */
interface ComponentInfoEntry {
  /** The visibility rules for this component. */
  visibilityRules?: VisibilityRuleDef[];
  /**
   * Locale-specific content attributes for this component. Keyed by locale
   * (e.g. `"en_US"`), each entry contains attribute values that are merged
   * into the component's `data` during page processing.
   */
  content?: {
    [locale: string]: Record<string, unknown>;
  };
  /** Data binding metadata for this component. Omitted when the component has no bindings. */
  dataBinding?: ComponentDataBinding;
  /** Whether this component is a fragment (a reusable, externally-managed content asset). */
  fragment?: boolean;
  /** Custom component data produced by the type's serialize script. Omitted when the component has no custom data. */
  custom?: Record<string, unknown>;
  /** Display name of the component. Omitted when the component has no name. */
  name?: string;
  /** Region-level configuration (e.g. maxComponents limits), keyed by region ID. */
  regions?: {
    [regionId: string]: RegionInfo;
  };
}
/**
 * Common base for every Page Designer manifest. Both {@link PageManifest} and
 * {@link ComponentManifest} share a {@link context} (qualifiers/groups/data
 * bindings hoisted from every visibility rule in the manifest) and a
 * {@link componentInfo} map of per-node metadata. Mirrors the backend `Manifest`
 * abstract class (`commerce/digital`).
 *
 * The {@link manifestType} discriminator is emitted by the backend on output
 * (read-only on input — the concrete class supplies it). It's optional on the
 * storefront type because legacy fixtures and existing in-memory manifests
 * may not carry it; production wire data always does.
 */
interface Manifest {
  /**
   * Discriminator identifying the concrete manifest kind. Emitted by the
   * backend on serialization; optional here because not every constructed
   * or fixture manifest sets it.
   */
  manifestType?: 'PAGE' | 'COMPONENT';
  /** Campaigns, customer groups, and data bindings hoisted from every visibility rule in this manifest. */
  context: PageManifestContext;
  /** Per-component metadata (visibility rules, locale content, data bindings, region config) keyed by component ID. */
  componentInfo: Record<string, ComponentInfoEntry>;
}
/**
 * A manifest containing all variations of a single Page Designer page for a
 * specific locale. Variations are evaluated in {@link variationOrder} sequence;
 * the first whose visibility rule passes is selected. If none match, the
 * {@link defaultVariation} is used as a fallback.
 *
 * Inherits {@link Manifest.context} and {@link Manifest.componentInfo}.
 */
interface PageManifest extends Manifest {
  manifestType?: 'PAGE';
  /** The unique identifier of the page this manifest represents. */
  pageId: string;
  /** Ordered list of variation IDs defining the evaluation sequence. */
  variationOrder: string[];
  /** Map of variation ID to its entry data. */
  variations: Record<string, VariationEntry>;
  /** The variation ID to use when no other variation's rule matches. */
  defaultVariation: string;
  /**
   * Per-component-type attribute definitions hoisted from the page layout
   * by the manifest builder, deduped by `typeId`. Used by the MRT
   * attribute resolver to dispatch by attribute type without round-tripping
   * to ECOM. Optional — older manifests may not include this field.
   */
  componentTypes?: Record<string, {
    attributeDefinitions: Record<string, AttributeDefinition>;
  }>;
  /**
   * Media-file domain name of the page's owning library. Used by the markup
   * URL rewriter to resolve `?$staticlink$` placeholders at request time.
   * Set by the manifest builder from `library.getMediaFileDomain().getDomainName()`.
   * Optional — older manifests may not include this field.
   */
  pageLibraryDomain?: string;
}
/**
 * A manifest for a single embedded (`embedded.*`) Page Designer content block —
 * a header, mini-cart, mega-menu, and so on. Embedded components are page-less
 * and served by SCAPI `getComponent`, so each is cached as a standalone unit
 * keyed by component ID.
 *
 * Unlike {@link PageManifest}, there are no page-level variations: an embedded
 * component either renders or not based on its own visibility rules. Inherits
 * {@link Manifest.context} and {@link Manifest.componentInfo}; the renderable
 * tree lives in {@link component} (SCAPI Component shape).
 *
 * Mirrors the backend `ComponentManifest` (`commerce/digital`).
 */
interface ComponentManifest extends Manifest {
  manifestType?: 'COMPONENT';
  /** The unique identifier of the embedded component this manifest represents. */
  componentId: string;
  /**
   * The renderable component tree, in SCAPI `Component` shape — the embedded
   * component root plus its nested regions and child components.
   */
  component: ShopperExperience.schemas['Component'];
  /**
   * Whether resolving this component requires additional data from ECOM
   * that MRT can't satisfy on its own — shopper qualifiers for visibility
   * rules, or a runtime data binding. Pre-computed during manifest
   * generation so the runtime can skip the ECOM round-trip entirely when
   * `false`.
   */
  requiresContext: boolean;
}
/** Region-level configuration extracted from the page manifest, including type filters and component limits. */
interface RegionInfo {
  /** The name of the region. */
  name?: string;
  /** The component type exclusions for the region. */
  componentTypeExclusions?: string[];
  /** The component type inclusions for the region. */
  componentTypeInclusions?: string[];
  /** Maximum number of visible components to render in this region. Omitted when there is no limit. */
  maxComponents?: number;
}
/**
 * Site-wide manifest containing content assignments that map product and category
 * identifiers to page IDs, plus the category hierarchy used for parent-category
 * traversal during lookup.
 */
interface SiteManifest {
  /**
   * Nested mapping of content assignments.
   * Structure: `aspectType -> objectType -> objectId -> assignment`.
   *
   * For example, a PDP assignment for product "nike-air-max-90":
   * `contentObjectAssignments.pdp.product["nike-air-max-90"].contentId`
   */
  contentObjectAssignments: {
    [aspectType: string]: {
      [objectType: string]: {
        [objectId: string]: {
          /** Whether this assignment was explicitly set or inherited from a parent category. */
          lookupMode: 'category-implicit' | 'category-explicit';
          /** The page ID assigned to this object. */
          contentId: string;
        };
      };
    };
  };
  /**
   * Category hierarchy used to traverse from child to parent when resolving
   * category-based content assignments.
   */
  categories: {
    [categoryId: string]: {
      /** Display name of the category. */
      name: string;
      /** ID of the parent category, or undefined for root categories. */
      parentCategory?: string;
    };
  };
}
/**
 * Data binding metadata for a component instance. Stored in the page manifest's
 * `componentInfo` map, keyed by component ID.
 */
interface ComponentDataBinding {
  /** Maps attribute names to expression strings (e.g. `"content_asset.body"`). */
  expressions: Record<string, string>;
  /** The data contexts bound to this component, identifying the records to resolve against. */
  contexts: DataBindingRequirement[];
}
/**
 * A campaign and promotion pair used in visibility rules. Both the campaign and
 * the specific promotion within it must be active in the shopper's context for
 * the qualifier to match.
 */
type CampaignQualifier = ShopperExperience.schemas['CampaignQualifier'];
/**
 * Metadata extracted from all variation rules in a {@link PageManifest}. Lists
 * every campaign qualifier and customer group referenced, so the runtime knows
 * which context values may be needed without inspecting each rule individually.
 */
interface PageManifestContext {
  /** All campaign/promotion pairs referenced by any variation's visibility rule. */
  campaignQualifiers: CampaignQualifier[];
  /** All customer group IDs referenced by any variation's visibility rule. */
  customerGroups: string[];
  /** All data bindings required by components on this page, hoisted for batch resolution. */
  dataBindings: DataBindingRequirement[];
}
/**
 * A single data binding requirement declared by a component. The `type`
 * identifies the data provider (e.g. `"content_asset"`, `"product"`) and the
 * `id` identifies the specific record within that provider.
 *
 * These requirements are hoisted into {@link PageManifestContext} so MRT can
 * request all required external data in a single batch during context resolution.
 */
type DataBindingRequirement = ShopperExperience.schemas['DataBindingRequirement'];
/**
 * A single page variation within a {@link PageManifest}. Each variation holds
 * the full page data and flags indicating whether qualifier context is needed
 * for selection or component-level processing.
 */
interface VariationEntry {
  /**
   * Whether this variation's page contains components with visibility rules
   * that require qualifier context. When `true`, the context resolver is called
   * before processing the page's components.
   */
  pageRequiresContext: boolean;
  /**
   * Whether this variation's own visibility rule requires qualifier context
   * to evaluate. When `true`, the context resolver is called before checking
   * the variation-level rule.
   */
  ruleRequiresContext: boolean;
  /** The visibility rule that must pass for this variation to be selected. Undefined for the default variation. */
  visibilityRule?: VisibilityRuleDef;
  /**
   * The full page data for this variation. Includes the SCAPI-shape page
   * metadata fields (`name`, `aspectTypeId`, `description`, `pageTitle`,
   * `pageDescription`, `pageKeywords`) populated from the default-locale
   * `Page` by the manifest builder. Non-default-locale overrides for
   * these fields live in {@link pageContent}.
   */
  page: ShopperExperience.schemas['Page'];
  /**
   * Per-locale overlay for the variation's page metadata. When the request
   * locale is not the default and the page metadata differs, the manifest
   * builder writes the **full set** of locale-specific page metadata fields
   * here (full replacement, not diff — see Q6 of the design plan).
   *
   * Each entry is a partial `Page` carrying only the metadata fields that
   * may be locale-overridden (`name`, `aspectTypeId`, `description`,
   * `pageTitle`, `pageDescription`, `pageKeywords`); structural fields
   * (`id`, `typeId`, `regions`) live on {@link page} and are never
   * locale-overlaid.
   *
   * Absent or missing entries fall back to the default-locale page
   * metadata. Optional — older manifests may not include this field.
   */
  pageContent?: {
    [locale: string]: PageMetadataOverlay;
  };
  /** Page-level region configuration for this variation, keyed by region ID. These are top-level regions owned by the page itself, not nested under a component. */
  regions: {
    [regionId: string]: RegionInfo;
  };
}
/**
 * Subset of {@link ShopperExperience.schemas#Page} fields that the manifest
 * builder may locale-overlay. Stored on
 * {@link VariationEntry.pageContent} keyed by locale ID. Structural fields
 * (`id`, `typeId`, `regions`) are intentionally excluded — they are not
 * locale-scoped.
 */
interface PageMetadataOverlay {
  name?: string;
  aspectTypeId?: string;
  description?: string;
  pageTitle?: string;
  pageDescription?: string;
  pageKeywords?: string;
}
/**
 * A visibility rule definition that controls when a page variation or component
 * is shown. All conditions within a rule use AND logic — every specified
 * condition must pass for the rule to be satisfied.
 */
interface VisibilityRuleDef {
  /** Customer groups that the shopper must belong to. All groups must match. */
  customerGroups?: string[];
  /** Campaign/promotion pairs that must be active. All qualifiers must match. */
  campaignQualifiers?: CampaignQualifier[];
  /** Time window during which the rule is active, as ISO 8601 UTC strings. */
  schedule?: {
    /** Start time as an ISO 8601 UTC string. Rule fails before this time. */
    start?: string;
    /** End time as an ISO 8601 UTC string. Rule fails after this time. */
    end?: string;
  };
  /** The locales for which this rule is active (e.g. `["en_US", "fr_FR"]`). The rule fails for locales not in this list. When `null`, the rule is valid for every locale. */
  activeLocales: string[] | null;
}
/**
 * Runtime context representing the current shopper's active qualifiers.
 * Passed to {@link validateRule} to evaluate visibility rules. This context
 * is typically resolved lazily — only fetched when a rule actually needs it.
 */
type QualifierContext = ShopperExperience.schemas['QualifierResolveResponse'];
/**
 * A resolved data binding object containing the fields returned by the data
 * provider for a specific record. For example, a resolved `content_asset`
 * might contain `{ title: "Winter Sale", body: "<div>…</div>" }`.
 */
type ResolvedDataBinding = Record<string, unknown>;
/**
 * The type of identifier used to look up content. Determines how the ID is
 * resolved to a manifest:
 * - `'page'` — Direct page ID, used as-is
 * - `'category'` — Category ID, resolved via content assignments with parent traversal
 * - `'product'` — Product ID, resolved via content assignments
 * - `'component'` — Direct embedded-component ID, used as-is to fetch a {@link ComponentManifest}
 */
type IdentifierType = 'page' | 'category' | 'product' | 'component';
/**
 * Storage interface for fetching page and site manifests. Implementations
 * decouple the page resolution logic from the underlying data source (e.g.,
 * filesystem, CDN, database).
 */
interface ManifestStorage {
  /** Fetch the page manifest for a given page ID. */
  getPageManifest(id: string): Promise<PageManifest | null>;
  /** Fetch the embedded-component manifest for a given component ID. */
  getComponentManifest(id: string): Promise<ComponentManifest | null>;
  /** Fetch the site-wide manifest for a given locale. */
  getSiteManifest(): Promise<SiteManifest | null>;
}
type ContextResolver = (context: PageManifest['context']) => Promise<QualifierContext | null>;
type VisitorContextType = 'page' | 'region' | 'component' | 'root';
type InferNodeFromType<TType extends VisitorContextType> = TType extends 'page' ? ShopperExperience.schemas['Page'] : TType extends 'region' ? ShopperExperience.schemas['Region'] : ShopperExperience.schemas['Component'];
//#endregion
//#region src/design/data/page/process-page.d.ts
/**
 * Context required for content processing. Carries the shopper's runtime
 * qualifiers, the per-component visibility / locale-content rules, and the
 * locale used to resolve locale-specific content. Shared between the
 * page-rooted ({@link PageManifest}) and component-rooted
 * ({@link ComponentManifest}) flows; {@link kind} selects which flow.
 */
interface PageProcessorContext {
  /**
   * Selects the entry point: `'page'` starts at `transformPage`, `'component'`
   * starts at `transformComponent`. Optional — defaults to `'page'` so older
   * callers and fixtures that don't carry the discriminator still resolve as
   * page-rooted (the original behaviour).
   */
  kind?: 'page' | 'component';
  /** The shopper's active qualifiers (campaigns, customer groups), or `null` if not resolved. */
  qualifiers: QualifierContext | null;
  /** Per-component metadata (visibility rules, locale content, region config) keyed by component ID. */
  componentInfo: Manifest['componentInfo'];
  /**
   * Page-level region configuration (e.g. `maxComponents` limits) for top-level
   * regions owned by the page itself. Only meaningful when {@link kind} is
   * `'page'` — embedded components have no page-level regions.
   */
  pageInfo?: {
    regions: VariationEntry['regions'];
  };
  /** The locale to use when resolving locale-specific component content (e.g. `"en_US"`). */
  locale: string;
  /** The site's default locale, used as a fallback when the current locale has no content entry (e.g. `"en_US"`). */
  defaultLocale: string;
  /**
   * Per-request resolution surface used by {@link resolveAttributeValues} to
   * convert manifest envelopes into the wire shape SCAPI `getPage` /
   * `getComponent` would have returned. The storefront-next middleware builds
   * it once per request and Page Designer preview supplies an editor-mode
   * equivalent.
   */
  attrCtx: AttributeResolutionContext;
  /**
   * Per-component-type attribute definitions hoisted by the manifest builder.
   * Keyed by `typeId`. Optional — when omitted, the resolver falls back to
   * structural detection for the image envelope and passes everything else
   * through.
   */
  componentTypes?: Record<string, {
    attributeDefinitions: Record<string, AttributeDefinition>;
  }>;
  /**
   * When `true` (default), invisible components are removed from the tree and
   * regions are truncated to their `maxComponents` limit. When `false`, invisible
   * components and overflow components are kept in the tree but marked with
   * `visible: false` — used in design/preview mode so the editor can display them.
   */
  pruneInvisible?: boolean;
}
declare function processPage(node: ShopperExperience.schemas['Page'], processorContext: PageProcessorContext): ShopperExperience.schemas['Page'];
declare function processPage(node: ShopperExperience.schemas['Component'], processorContext: PageProcessorContext): ShopperExperience.schemas['Component'];
//#endregion
//#region src/design/data/page/transform.d.ts
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
declare class VisitorContext<TNode> {
  private readonly context;
  constructor(context: {
    /** The current node being visited. */
    node: TNode;
    /** The node type */
    type: VisitorContextType;
    /** The visitor being used to transform the page tree. */
    visitor: PageVisitor;
    /** The root page being traversed. */
    page?: ShopperExperience.schemas['Page'];
    /** The parent visitor context, providing access to the node that contains the current one in the page tree. */
    parent?: VisitorContext<ShopperExperience.schemas['Page'] | ShopperExperience.schemas['Region'] | ShopperExperience.schemas['Component']>;
    /** The parent region of the current node, if traversing within a region. */
    parentRegion?: ShopperExperience.schemas['Region'];
    /** The parent component of the current node, if traversing within a component's nested regions. */
    parentComponent?: ShopperExperience.schemas['Component'];
  });
  get type(): VisitorContextType;
  /**
   * The current node being visited.
   */
  get node(): TNode;
  /**
   * The root page being traversed.
   */
  get page(): ShopperExperience.schemas['Page'] | undefined;
  /**
   * The parent visitor context, providing access to the node that contains the current one in the page tree.
   */
  get parent(): VisitorContext<ShopperExperience.schemas['Page'] | ShopperExperience.schemas['Region'] | ShopperExperience.schemas['Component']> | undefined;
  /**
   * The parent region of the current node, if traversing within a region.
   */
  get parentRegion(): ShopperExperience.schemas['Region'] | undefined;
  /**
   * The parent component of the current node, if traversing within a component's nested regions.
   */
  get parentComponent(): ShopperExperience.schemas['Component'] | undefined;
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
  visitRegions(regions?: ShopperExperience.schemas['Region'][]): ShopperExperience.schemas['Region'][];
  /**
   * Traverses a single region. If the visitor has a `visitRegion` handler, the
   * handler is called with a new {@link VisitorContext} for the region. Otherwise,
   * the region's child components are traversed automatically.
   *
   * @param region - The region to visit.
   * @returns The transformed region, or `null` to exclude it.
   */
  visitRegion(region: ShopperExperience.schemas['Region']): ShopperExperience.schemas['Region'] | null;
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
  visitComponents(components?: ShopperExperience.schemas['Component'][]): ShopperExperience.schemas['Component'][];
  /**
   * Traverses a single component. If the visitor has a `visitComponent` handler,
   * the handler is called with a new {@link VisitorContext} for the component.
   * Otherwise, the component's nested regions are traversed automatically.
   *
   * @param component - The component to visit.
   * @returns The transformed component, or `null` to exclude it.
   */
  visitComponent(component: ShopperExperience.schemas['Component']): ShopperExperience.schemas['Component'] | null;
  /**
   * Traverses a single page. If the visitor has a `visitPage` handler, the
   * handler is called with a new {@link VisitorContext} for the page. Otherwise,
   * the page's regions are traversed automatically.
   *
   * @param page - The page to visit.
   * @returns The transformed page, or `null` to exclude it.
   */
  visitPage(page: ShopperExperience.schemas['Page']): ShopperExperience.schemas['Page'] | null;
  private toChildContext;
}
/**
 * Visitor interface for traversing and transforming a Page Designer page tree.
 * Implement any combination of visit methods to intercept pages, regions, or
 * components during traversal. Return `null` from `visitRegion` or
 * `visitComponent` to remove that element from the tree.
 */
interface PageVisitor {
  visitPage?(context: VisitorContext<ShopperExperience.schemas['Page']>): ShopperExperience.schemas['Page'];
  visitRegion?(context: VisitorContext<ShopperExperience.schemas['Region']>): ShopperExperience.schemas['Region'] | null;
  visitComponent?(component: VisitorContext<ShopperExperience.schemas['Component']>): ShopperExperience.schemas['Component'] | null;
}
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
declare function transformPage(page: ShopperExperience.schemas['Page'], visitor: PageVisitor): ShopperExperience.schemas['Page'] | null;
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
declare function transformComponent(component: ShopperExperience.schemas['Component'], visitor: PageVisitor): ShopperExperience.schemas['Component'] | null;
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
declare function transformRegion(region: ShopperExperience.schemas['Region'], visitor: PageVisitor): ShopperExperience.schemas['Region'] | null;
//#endregion
//#region src/design/data/errors/required.d.ts
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
declare class RequiredError extends Error {
  constructor(message: string);
  static assert<TValue>(value: TValue, message: string, isEmpty?: (value: TValue) => boolean): asserts value is NonNullable<TValue>;
}
//#endregion
//#region src/design/data/page/resolve-page.d.ts
/**
 * Options accepted by {@link resolvePage}. The shape of `id` and the result
 * are determined by `identifierType`:
 *
 * - For `'page' | 'category' | 'product'`, the id is resolved through site
 *   content assignments (where applicable) into a {@link PageManifest} and a
 *   personalised SCAPI {@link ShopperExperience.schemas#Page} is returned.
 * - For `'component'`, the id is used directly to fetch a
 *   {@link ComponentManifest} (no assignment lookup, no variation selection,
 *   no aspect type) and a SCAPI {@link ShopperExperience.schemas#Component} is
 *   returned.
 */
interface ResolvePageOptions {
  id: string;
  identifierType: IdentifierType;
  /** Required only for `'product' | 'category'`; ignored for `'page'` and `'component'`. */
  aspectType?: string;
  /**
   * Fallback category ID (or a Promise resolving to one) consulted only
   * when `identifierType === 'product'` and the product has no content
   * assignment for the requested aspect type. Awaited lazily — the happy
   * path skips it.
   */
  categoryId?: string | Promise<string | null | undefined> | null;
  locale: string;
  defaultLocale: string;
  manifestStorage: ManifestStorage;
  contextResolver?: ContextResolver;
  /**
   * Per-request resolution surface for attribute envelope rewriting. Built
   * once per request by the storefront-next middleware (or Page Designer
   * preview). For pages, the `componentTypes` map travels on the
   * {@link PageManifest} itself and is read off the manifest before being
   * threaded into {@link processPage}.
   */
  attrCtx: AttributeResolutionContext;
  pruneInvisible?: boolean;
}
/**
 * Main entry point for the Page Designer content resolution pipeline. Handles
 * both the page-rooted flow (`'page' | 'category' | 'product'`) and the
 * embedded-component-rooted flow (`'component'`) behind a single callable
 * surface so callers don't fork on identifier type.
 *
 * **Page flow** (`'page' | 'category' | 'product'`):
 * 1. **Resolve dynamic page ID** — for product/category identifiers, look up
 *    the assigned page ID via content assignments in the site manifest.
 * 2. **Fetch page manifest** — load all variations for the resolved page.
 * 3. **Select variation** — evaluate visibility rules to pick the right variation.
 * 4. **Load qualifier context** — lazily fetch the shopper's context only if needed.
 * 5. **Process** — filter out components that fail visibility rules.
 *
 * **Component flow** (`'component'`):
 * 1. **Fetch component manifest** — direct DAL lookup by component ID.
 * 2. **Load qualifier context** — only when `requiresContext === true` (skip
 *    the ECOM round-trip entirely otherwise — pre-computed during generation).
 * 3. **Process** — same visibility / locale / data-binding pipeline as pages.
 *
 * Returns `null` when the id cannot be resolved, the manifest is missing, or
 * (page flow only) no variation is available — fail-open so the middleware can
 * fall through to SCAPI.
 *
 * @param options - The resolution options. See {@link ResolvePageOptions}.
 * @returns The resolved & filtered SCAPI Page (page flow) or Component
 *          (component flow), or `null` on miss.
 *
 * @example
 * ```ts
 * // Page flow
 * const page = await resolvePage({
 *     id: 'nike-air-max-90',
 *     identifierType: 'product',
 *     aspectType: 'pdp',
 *     locale: 'en-US',
 *     defaultLocale: 'en-US',
 *     manifestStorage,
 *     attrCtx,
 * });
 *
 * // Component flow (embedded `embedded.*` block — header, mini-cart, …)
 * const header = await resolvePage({
 *     id: 'header',
 *     identifierType: 'component',
 *     locale: 'en-US',
 *     defaultLocale: 'en-US',
 *     manifestStorage,
 *     attrCtx,
 * });
 * ```
 */
declare function resolvePage(options: ResolvePageOptions & {
  identifierType: 'component';
}): Promise<ShopperExperience.schemas['Component'] | null>;
declare function resolvePage(options: ResolvePageOptions & {
  identifierType: 'page' | 'category' | 'product';
}): Promise<ShopperExperience.schemas['Page'] | null>;
declare function resolvePage(options: ResolvePageOptions): Promise<ShopperExperience.schemas['Page'] | ShopperExperience.schemas['Component'] | null>;
//#endregion
//#region src/design/data/validate-rule.d.ts
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
declare function validateRule(rule: VisibilityRuleDef, locale: string, context?: QualifierContext | null): boolean;
//#endregion
export { type AttributeResolutionContext, type AttributeResolutionWarning, type ComponentInfoEntry, type ComponentManifest, type ContextResolver, type IdentifierType, type InferNodeFromType, type Manifest, type ManifestStorage, type PageManifest, type PageProcessorContext, type PageVisitor, type QualifierContext, RequiredError, type ResolvePageOptions, type ResolvedDataBinding, type SiteManifest, type VisibilityRuleDef, type VisitorContext, type VisitorContextType, processPage, resolvePage, transformComponent, transformPage, transformRegion, validateRule };
//# sourceMappingURL=design-data.d.ts.map