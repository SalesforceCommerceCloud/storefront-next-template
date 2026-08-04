//#region src/security/defaults.ts
/**
* SDK default CSP directives. Customers extending CSP should spread this:
*
* ```ts
* import { defaultCspDirectives } from '@salesforce/storefront-next-runtime/security';
* security: {
*   csp: {
*     directives: {
*       ...defaultCspDirectives,
*       'script-src': [...defaultCspDirectives['script-src']!, 'https://cdn.foo.com'],
*     },
*   },
* }
* ```
*
* The per-request nonce is appended to `script-src` at request time; it is
* NOT in this static map.
*/
const defaultCspDirectives = {
	"default-src": ["'self'"],
	"script-src": [
		"'self'",
		"https://challenges.cloudflare.com",
		"https://maps.googleapis.com"
	],
	"style-src": ["'self'", "'unsafe-inline'"],
	"img-src": [
		"'self'",
		"data:",
		"https://*.commercecloud.salesforce.com",
		"https://*.demandware.net",
		"https://*.cc.salesforce.com"
	],
	"font-src": ["'self'", "data:"],
	"connect-src": [
		"'self'",
		"https://*.commercecloud.salesforce.com",
		"https://*.demandware.net",
		"https://challenges.cloudflare.com",
		"https://api.cquotient.com",
		"https://places.googleapis.com",
		"https://maps.googleapis.com"
	],
	"frame-src": ["https://challenges.cloudflare.com"],
	"frame-ancestors": ["'self'"],
	"form-action": ["'self'"],
	"base-uri": ["'self'"],
	"object-src": ["'none'"],
	"upgrade-insecure-requests": true
};
/**
* Salesforce-owned host families that may legitimately embed the storefront
* in an iframe — Business Manager / Page Designer editor and preview frames.
*
* Used by the security middleware to relax `frame-ancestors` only on requests
* that are actually Page Designer EDIT/PREVIEW (`?mode=EDIT|PREVIEW`). Normal
* shopper traffic continues to ship `frame-ancestors 'self'`.
*
* Wildcards are bounded to Salesforce-registrable domains; only Salesforce
* can issue subdomains under these zones.
*/
const pageDesignerFrameAncestors = [
	"https://*.unified.demandware.net",
	"https://*.commercecloud.salesforce.com",
	"https://*.demandware.net"
];
const defaultSecurityHeaders = {
	enabled: true,
	csp: {
		directives: defaultCspDirectives,
		reportOnly: false
	},
	hsts: {
		maxAge: 15552e3,
		includeSubDomains: true,
		preload: false
	},
	frameOptions: "SAMEORIGIN",
	contentTypeOptions: "nosniff",
	referrerPolicy: "strict-origin-when-cross-origin",
	permissionsPolicy: {
		camera: [],
		microphone: [],
		geolocation: []
	}
};

//#endregion
export { defaultSecurityHeaders as n, pageDesignerFrameAncestors as r, defaultCspDirectives as t };
//# sourceMappingURL=defaults.js.map