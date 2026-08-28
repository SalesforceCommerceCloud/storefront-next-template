import "./messaging-api.js";
import "./DesignContext.js";
import "./modeDetection.js";
import { i as usePageDesignerMode, n as useDesignContext } from "./DesignContext2.js";
import { useEffect } from "react";
import { Fragment, jsx } from "react/jsx-runtime";

//#region src/design/react/components/PageRegistration.tsx
/**
* Wraps page designer page content and communicates page data back up to the host Page Designer.
* @param props.page - The page data to communicate back to the host Page Designer.
*/
function PageRegistration({ page, children }) {
	const { setClientPage } = useDesignContext() ?? {};
	const { isDesignMode } = usePageDesignerMode();
	useEffect(() => {
		if (isDesignMode) setClientPage?.(page);
	}, [
		page,
		isDesignMode,
		setClientPage
	]);
	return /* @__PURE__ */ jsx(Fragment, { children });
}

//#endregion
export { PageRegistration };
//# sourceMappingURL=PageRegistration.js.map