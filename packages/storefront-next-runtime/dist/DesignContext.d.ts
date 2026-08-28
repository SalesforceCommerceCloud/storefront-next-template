import { r as ShopperExperience } from "./types2.js";
import { S as ClientAcknowledgedEvent, l as EventPayload, r as ClientApi } from "./index.js";
import React from "react";

//#region src/design/react/core/component.types.d.ts

/**
 * How the client applies page updates from the design layer.
 * - 'client': Page updates are applied in-browser without reloading the page.
 * - 'server': Page updates require a round trip to the server to render a new page.
 */
type PageUpdateMode = 'client' | 'server';
/**
 * Default component constructor interface.
 * Used to define default components that should be instantiated in a region.
 */
interface DefaultComponentConstructor {
  /** Unique identifier for the component instance */
  id: string;
  /** Component type ID to instantiate */
  typeId: string;
  /** Component data/attributes */
  data: Record<string, unknown>;
}
interface RegionDesignMetadata {
  /**
   * The id of the component or region.
   */
  id: string;
  /**
   * The name of the component or region.
   */
  name?: string;
  /**
   * Optional description for the region.
   */
  description?: string;
  /**
   * Maximum number of components allowed in the region.
   */
  maxComponents?: number;
  /**
   * A list of content link UUIDs for component instances in this region.
   */
  contentLinkUuids?: string[];
  /**
   * A list of allowed component types in this region.
   */
  componentTypeInclusions?: string[];
  /**
   * A list of forbidden component types in this region.
   */
  componentTypeExclusions?: string[];
  /**
   * Default components to instantiate when the region is created.
   */
  defaultComponentConstructors?: DefaultComponentConstructor[];
}
interface ComponentDesignMetadata {
  /**
   * The id of the component or region.
   */
  id: string;
  /**
   * The unique identifier for the content link between this component
   * and its parent.
   */
  contentLinkUuid?: string;
  /**
   * Whether the component is a fragment.
   */
  isFragment: boolean;
  /**
   * Whether the component is visible based on the current visiblity rules and context.
   */
  isVisible: boolean;
  /**
   * Whether the component has been localized in the current locale.
   */
  isLocalized: boolean;
  /**
   * The name of the component or region.
   */
  name?: string;
  /**
   * The region definitions for this component.
   */
  regionDefinitions?: RegionDesignMetadata[];
}
/**
 * Props for a component produced by {@link createReactComponentDesignDecorator}.
 *
 * `children` is the decorated component's own nested content (a `ReactNode`),
 * matching how the component renders in both design and non-design mode.
 */
type ComponentDecoratorProps<TProps> = React.PropsWithChildren<{
  designMetadata?: ComponentDesignMetadata;
  visible?: boolean;
  localized?: boolean;
} & TProps>;
type RegionDecoratorProps<TProps> = React.PropsWithChildren<{
  designMetadata?: RegionDesignMetadata;
  className?: string;
} & TProps>;
//#endregion
//#region src/design/react/core/DesignContext.d.ts
/**
 * Type definition for the Design Context
 * Extends DesignState with additional design-time properties
 */
interface DesignContextType {
  /** Whether design mode is currently active */
  isDesignMode: boolean;
  /** Client API for host communication */
  clientApi?: ClientApi;
  /** Whether the client is connected to the host */
  isConnected: boolean;
  /** The page designer config */
  pageDesignerConfig: EventPayload<ClientAcknowledgedEvent> | null;
  /** Page data that the client has retrieved */
  clientPage: ShopperExperience.schemas['Page'] | null;
  /** Sets the client page data */
  setClientPage: (page: ShopperExperience.schemas['Page']) => void;
  /** How the client applies page updates from the design layer. */
  pageUpdateMode: PageUpdateMode;
}
declare const useDesignContext: () => DesignContextType | null;
//#endregion
export { RegionDecoratorProps as a, PageUpdateMode as i, ComponentDecoratorProps as n, RegionDesignMetadata as o, ComponentDesignMetadata as r, useDesignContext as t };
//# sourceMappingURL=DesignContext.d.ts.map