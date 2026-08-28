import "./types2.js";
import "./index.js";
import { n as ComponentDecoratorProps, o as RegionDesignMetadata, r as ComponentDesignMetadata, t as useDesignContext } from "./DesignContext.js";
import React from "react";

//#region src/design/react/components/page.types.d.ts

interface PageDesignMetadata {
  id: string;
  name: string;
  description?: string;
  archType?: 'controller' | 'headless';
  route?: string;
  supportedAspectTypes?: string[];
  regionDefinitions?: RegionDesignMetadata[];
  attributeDefinitionGroups?: {
    id: string;
    name?: string;
    description?: string;
    attributeDefinitions?: Record<string, unknown>[];
  }[];
}
type PageDecoratorProps<TProps> = React.PropsWithChildren<{
  designMetadata?: PageDesignMetadata;
} & TProps>;
//#endregion
export { type ComponentDecoratorProps, type ComponentDesignMetadata, type PageDecoratorProps, type RegionDesignMetadata, useDesignContext };
//# sourceMappingURL=design-react.d.ts.map