import { r as ShopperExperience } from "./types2.js";
import { i as FrameworkAdapter, n as ComponentModule } from "./types3.js";
import { g as IsomorphicConfiguration } from "./index.js";
import { r as RegionDecoratorProps, t as ComponentDecoratorProps } from "./component.types.js";
import React$1 from "react";
import * as react_jsx_runtime2 from "react/jsx-runtime";

//#region src/design/react/core/PageDesignerProvider.d.ts
type PageDesignerContextType = {
  isDesignMode: boolean;
  isPreviewMode: boolean;
};
declare const usePageDesignerMode: () => PageDesignerContextType;
type PageDesignerProviderProps = {
  children: React.ReactNode;
  clientId: string;
  targetOrigin: string;
  usid?: string;
  clientLogger?: IsomorphicConfiguration['logger'];
  clientConnectionTimeout?: number;
  clientConnectionInterval?: number;
  mode?: 'EDIT' | 'PREVIEW';
};
declare const PageDesignerProvider: {
  ({
    children,
    targetOrigin,
    clientId,
    usid,
    clientLogger,
    clientConnectionTimeout,
    clientConnectionInterval,
    mode
  }: PageDesignerProviderProps): React.JSX.Element;
  defaultProps: {
    clientConnectionTimeout: number;
    clientConnectionInterval: number;
    mode: undefined;
    clientLogger: () => void;
  };
};
//#endregion
//#region src/design/react/core/PageDesignerPageMetadataProvider.d.ts
/**
 * Provides the page metadata for Page Designer.
 */
declare function PageDesignerPageMetadataProvider({
  page,
  children
}: React.PropsWithChildren<{
  page: ShopperExperience.schemas['Page'];
}>): react_jsx_runtime2.JSX.Element;
//#endregion
//#region src/design/react/core/RegionContext.d.ts
interface RegionContextType {
  regionId: string;
  contentLinkUuids: string[];
}
declare const useRegionContext: () => RegionContextType | null;
//#endregion
//#region src/design/react/core/ComponentDecorator.d.ts
/**
 * Creates a higher-order component that wraps React components with design-time functionality.
 * In design mode, adds visual indicators, selection handling, and host communication.
 * In normal mode, renders the component unchanged for optimal performance.
 *
 * @template TProps - The props type of the component being decorated
 * @param Component - The React component to wrap with design functionality
 * @returns A new component with design-time capabilities
 */
declare function createReactComponentDesignDecorator<TProps>(Component: React.ComponentType<TProps>): (props: ComponentDecoratorProps<TProps>) => React.JSX.Element;
//#endregion
//#region src/design/react/core/RegionDecorator.d.ts
declare function createReactRegionDesignDecorator<TProps>(Region: React.ComponentType<TProps>): (props: RegionDecoratorProps<TProps>) => React.JSX.Element;
//#endregion
//#region src/design/react/core/adapter.d.ts
type ReactComponentModule<TProps> = ComponentModule<TProps, ReactDesignComponentType<TProps>>;
/**
 * A React component that optionally accepts design metadata.
 * Any component returned from the registry could potentially accept design metadata.
 * This includes both regular components and lazy components with their React-specific properties.
 */
type ReactDesignComponentType<TProps> = React$1.ComponentType<TProps> | React$1.LazyExoticComponent<React$1.ComponentType<TProps>>;
/**
 * React framework adapter that implements React-specific behavior
 * for the framework-agnostic component registry.
 */
declare class ReactAdapter<TProps> implements FrameworkAdapter<TProps, ReactDesignComponentType<TProps>> {
  /**
   * Creates a React lazy component from an importer function.
   */
  createLazyComponent(importer: () => Promise<ReactComponentModule<TProps>>): ReactDesignComponentType<TProps>;
  /**
   * Decorates a React component with design-time capabilities.
   * Uses the React-specific design decorator directly.
   */
  decorateComponent(component: ReactDesignComponentType<TProps>): ReactDesignComponentType<TProps>;
}
/**
 * Creates a React adapter instance with optional configuration.
 */
declare function createReactAdapter<TProps>(): ReactAdapter<TProps>;
//#endregion
export { PageDesignerPageMetadataProvider, PageDesignerProvider, type ReactDesignComponentType, createReactAdapter, createReactComponentDesignDecorator, createReactRegionDesignDecorator, usePageDesignerMode, useRegionContext };
//# sourceMappingURL=design-react-core.d.ts.map