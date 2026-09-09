import { Flags } from "@oclif/core";
import { OAuthCommand } from "@salesforce/b2c-tooling-sdk/cli";
import { createSlasClient } from "@salesforce/b2c-tooling-sdk/clients";

//#region src/commands/setup-base-cartridge.ts
const SFNEXT_NOTIFY_SCOPE = "c_sfnext_notify";
/**
* Register the required SLAS scopes for app_storefrontnext_base on a SLAS client.
*
* Fetches the existing SLAS client, merges in the `c_sfnext_notify` scope,
* and writes the result back. Safe to re-run — exits early if the scope is
* already registered.
*
* @env SFCC_SHORTCODE - SCAPI short code (required)
* @env SFCC_TENANT_ID - Tenant ID (required)
* @env SFCC_OAUTH_CLIENT_ID - Account Manager OAuth client ID (required)
* @env SFCC_OAUTH_CLIENT_SECRET - Account Manager OAuth client secret (required)
*/
var SetupBaseCartridge = class SetupBaseCartridge extends OAuthCommand {
	static description = "Register the required SLAS scopes for the base cartridge on a client";
	static examples = ["<%= config.bin %> <%= command.id %> --slas-client-id my-slas-client-id", "<%= config.bin %> <%= command.id %> --slas-client-id my-slas-client-id --tenant-id my_tenant_001"];
	static flags = {
		...OAuthCommand.baseFlags,
		"slas-client-id": Flags.string({
			description: "SLAS client ID to update with the required scopes",
			required: true
		})
	};
	async run() {
		const { flags } = await this.parse(SetupBaseCartridge);
		const targetClientId = flags["slas-client-id"];
		const { shortCode, tenantId } = this.resolvedConfig.values;
		if (!shortCode) this.error("SCAPI short code required. Provide --short-code, set SFCC_SHORTCODE, or configure it in dw.json.");
		if (!tenantId) this.error("Tenant ID required. Provide --tenant-id, set SFCC_TENANT_ID, or configure it in dw.json.");
		const auth = this.getOAuthStrategy();
		const client = createSlasClient({ shortCode }, auth);
		this.log(`Fetching SLAS client "${targetClientId}" for tenant "${tenantId}"...`);
		const { data: existing, error: getError, response: getResponse } = await client.GET("/tenants/{tenantId}/clients/{clientId}", { params: { path: {
			tenantId,
			clientId: targetClientId
		} } });
		if (getError || !existing) {
			const body = await getResponse.text().catch(() => "");
			this.error(`Failed to fetch SLAS client: ${getResponse.status} ${getResponse.statusText}${body ? `\n${body}` : ""}`);
		}
		const splitDelimited = (value) => [].concat(value ?? []).flatMap((u) => u.split(/[|\s]+/).filter(Boolean));
		const currentScopes = splitDelimited(existing.scopes);
		if (currentScopes.includes(SFNEXT_NOTIFY_SCOPE)) {
			this.log(`Scope "${SFNEXT_NOTIFY_SCOPE}" is already registered on client "${targetClientId}". Nothing to do.`);
			return;
		}
		const updatedScopes = [...currentScopes, SFNEXT_NOTIFY_SCOPE];
		this.log(`Adding scope "${SFNEXT_NOTIFY_SCOPE}" to client "${targetClientId}"...`);
		this.debug(`Existing client: ${JSON.stringify(existing, null, 2)}`);
		const redirectUri = splitDelimited(existing.redirectUri);
		const callbackUri = existing.callbackUri != null ? splitDelimited(existing.callbackUri) : void 0;
		const { error: putError, response: putResponse } = await client.PUT("/tenants/{tenantId}/clients/{clientId}", {
			params: { path: {
				tenantId,
				clientId: targetClientId
			} },
			body: {
				...existing,
				scopes: updatedScopes,
				redirectUri,
				callbackUri,
				isPrivateClient: existing.isPrivateClient ?? false
			}
		});
		if (putError) {
			const detail = `\n${JSON.stringify(putError, null, 2)}`;
			this.error(`Failed to update SLAS client: ${putResponse.status} ${putResponse.statusText}${detail}`);
		}
		this.log(`Done! Scope "${SFNEXT_NOTIFY_SCOPE}" registered on client "${targetClientId}".`);
		this.log("");
		this.log("Next steps:");
		this.log("  1. Deploy the base cartridge: sfnext cartridge:deploy --reload");
		this.log("  2. Add app_storefrontnext_base to your site's cartridge path in Business Manager");
	}
};

//#endregion
export { SetupBaseCartridge as default };