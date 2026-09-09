import { createSlasClient } from "@salesforce/b2c-tooling-sdk/clients";
import { resolveAuthStrategy } from "@salesforce/b2c-tooling-sdk";

//#region src/hooks/operation-lifecycle.ts
const SFNEXT_BASE_CARTRIDGE = "app_storefrontnext_base";
const SFNEXT_NOTIFY_SCOPE = "c_sfnext_notify";
/**
* Oclif b2c:operation-lifecycle hook.
*
* Registers a post-deploy provider that checks whether the `c_sfnext_notify`
* SLAS scope is registered on the SLAS client after a `code:deploy` operation
* that includes `app_storefrontnext_base`.
*
* The check requires the operation context to supply `metadata.clientId` (the
* SLAS client ID to verify) along with the environment variables below. If any
* prerequisite is absent the check is skipped silently — it never blocks a deploy.
*
* @env SFCC_SHORTCODE - SCAPI short code for the SLAS Admin API base URL (required for scope check)
* @env SFCC_TENANT_ID - Tenant ID for the SLAS Admin API request (required for scope check)
*/
const hook = function(_options) {
	return Promise.resolve({ providers: [{
		name: "sfnext-notify-scope-check",
		afterOperation: async (context, result) => {
			if (context.operationType !== "code:deploy" || !result.success) return;
			const { cartridges } = context.metadata;
			if (!Array.isArray(cartridges)) return;
			if (!cartridges.some((c) => {
				if (typeof c === "string") return c === SFNEXT_BASE_CARTRIDGE;
				if (typeof c === "object" && c !== null && "name" in c) return c.name === SFNEXT_BASE_CARTRIDGE;
				return false;
			})) return;
			const shortCode = process.env.SFCC_SHORTCODE;
			const tenantId = process.env.SFCC_TENANT_ID;
			const { clientId } = context.metadata;
			const oauthConfig = context.instance.auth.oauth;
			if (!shortCode || !tenantId || typeof clientId !== "string" || !oauthConfig || !oauthConfig.clientId || !oauthConfig.clientSecret) {
				this.debug("Email scope check skipped: missing SFCC_SHORTCODE, SFCC_TENANT_ID, metadata.clientId, or OAuth client secret");
				return;
			}
			try {
				const auth = resolveAuthStrategy({
					clientId: oauthConfig.clientId,
					clientSecret: oauthConfig.clientSecret
				}, { allowedMethods: ["client-credentials"] });
				const { data, error } = await createSlasClient({ shortCode }, auth).GET("/tenants/{tenantId}/clients/{clientId}", { params: { path: {
					tenantId,
					clientId
				} } });
				if (error || !data) {
					this.debug(`Email scope check skipped: SLAS GET failed for client "${clientId}"`);
					return;
				}
				const rawScopes = data.scopes;
				if (!(Array.isArray(rawScopes) ? rawScopes : typeof rawScopes === "string" ? rawScopes.split(/[\s|]+/).filter(Boolean) : []).includes(SFNEXT_NOTIFY_SCOPE)) this.warn(`The ${SFNEXT_BASE_CARTRIDGE} cartridge is deployed but the ${SFNEXT_NOTIFY_SCOPE} scope is not registered on your SLAS client.\nRun: sfnext setup-base-cartridge --slas-client-id ${clientId}`);
			} catch (err) {
				this.debug(`Email scope check failed: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
	}] });
};
var operation_lifecycle_default = hook;

//#endregion
export { operation_lifecycle_default as default };