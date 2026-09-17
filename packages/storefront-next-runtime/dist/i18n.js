import "./env2.js";
import "./cookie-domain2.js";
import { a as requestToLocaleMap } from "./site-context2.js";
import "./apply-url-config.js";
import { createContext } from "react-router";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { createI18nextMiddleware } from "remix-i18next/middleware";

//#region src/i18n/context.ts
const i18nextContext = createContext(null);
/**
* Gets the i18next instance and translation function for non-component code.
* Use `useTranslation` hook for React components. Mirrors the `getConfig`/`useConfig` pattern.
*/
function getTranslation(context) {
	if (context && typeof window === "undefined") {
		const i18nextData = context.get(i18nextContext);
		if (!i18nextData) throw new Error("i18next data not found in context. Ensure i18next middleware runs before loaders.");
		const i18nextInstance = i18nextData.getI18nextInstance();
		return {
			i18next: i18nextInstance,
			t: i18nextInstance.t
		};
	}
	return {
		i18next,
		t: i18next.t
	};
}
/**
* Gets the active locale string from server context.
* Returns undefined on the client (locale is on the document element or URL).
*/
function getLocale(context) {
	return context.get(i18nextContext)?.getLocale();
}
/**
* Sets up a mock i18n context on a RouterContextProvider for use in tests.
* Replaces the need to import the internal i18nextContext key directly.
*/
function mockI18nContext(contextProvider, options = {}) {
	const { locale = "en-GB", instance = i18next } = options;
	contextProvider.set(i18nextContext, {
		getLocale: () => locale,
		getI18nextInstance: () => instance
	});
}

//#endregion
//#region src/i18n/defaults.ts
/** Shared i18next interpolation config. Disables HTML escaping (React handles that) and adds `{{ value, number }}` formatting via `toLocaleString`. */
const defaultInterpolation = {
	escapeValue: false,
	format: (value, format) => {
		if (format === "number" && typeof value === "number") return value.toLocaleString();
		return value;
	}
};

//#endregion
//#region src/i18n/middleware.ts
/**
* Creates a server-side i18next middleware from the provided config.
* Lazy-initializes on first request so supported languages can come from runtime config.
*/
function createI18nMiddleware(config) {
	const { resources, supportedLanguages, fallbackLanguage, interpolation, plugins = [] } = config;
	let cached = null;
	return async (args, next) => {
		if (!cached) cached = createI18nextMiddleware({
			detection: {
				order: ["custom"],
				findLocale: async (request) => {
					return requestToLocaleMap.get(request) ?? null;
				},
				fallbackLanguage,
				supportedLanguages
			},
			i18next: {
				resources,
				interpolation: {
					...defaultInterpolation,
					...interpolation
				}
			},
			plugins: [initReactI18next, ...plugins]
		});
		const [originalMiddleware, getLocale$1, getInstance] = cached;
		args.context.set(i18nextContext, {
			getLocale: () => getLocale$1(args.context),
			getI18nextInstance: () => getInstance(args.context)
		});
		return originalMiddleware(args, next);
	};
}

//#endregion
export { createI18nMiddleware, defaultInterpolation, getLocale, getTranslation, mockI18nContext };
//# sourceMappingURL=i18n.js.map