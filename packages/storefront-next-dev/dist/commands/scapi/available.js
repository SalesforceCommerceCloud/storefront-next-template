import { i as isBuiltInClientKey, r as deriveClientKey } from "../../schema-utils.js";
import { OAuthCommand } from "@salesforce/b2c-tooling-sdk/cli";
import { createScapiSchemasClient, toOrganizationId } from "@salesforce/b2c-tooling-sdk/clients";

//#region src/commands/scapi/available.ts
/**
* Survey SCAPI schemas on the active tenant to plan override testing. Lists:
* - Built-in shopper APIs (always available platform-side; overridable by sfnext scapi)
*   along with how many `c_*` custom attributes each currently has on this tenant.
* - Tenant-registered custom SCAPI APIs (from the Schemas API endpoint).
*
* Authentication reuses the same pipeline as `sfnext scapi add`.
*/
const BUILT_IN_APIS = [
	{
		apiFamily: "product",
		apiName: "shopper-availability",
		apiVersion: "v1",
		clientKey: "shopperAvailability"
	},
	{
		apiFamily: "checkout",
		apiName: "shopper-baskets",
		apiVersion: "v1",
		clientKey: "shopperBasketsV1"
	},
	{
		apiFamily: "checkout",
		apiName: "shopper-baskets",
		apiVersion: "v2",
		clientKey: "shopperBasketsV2"
	},
	{
		apiFamily: "configuration",
		apiName: "shopper-configurations",
		apiVersion: "v1",
		clientKey: "shopperConfigurations"
	},
	{
		apiFamily: "shopper",
		apiName: "shopper-consents",
		apiVersion: "v1",
		clientKey: "shopperConsents"
	},
	{
		apiFamily: "shopper",
		apiName: "shopper-context",
		apiVersion: "v1",
		clientKey: "shopperContext"
	},
	{
		apiFamily: "customer",
		apiName: "shopper-customers",
		apiVersion: "v1",
		clientKey: "shopperCustomers"
	},
	{
		apiFamily: "product",
		apiName: "shopper-delivery-estimates",
		apiVersion: "v1",
		clientKey: "shopperDeliveryEstimates"
	},
	{
		apiFamily: "experience",
		apiName: "shopper-experience",
		apiVersion: "v1",
		clientKey: "shopperExperience"
	},
	{
		apiFamily: "pricing",
		apiName: "shopper-gift-certificates",
		apiVersion: "v1",
		clientKey: "shopperGiftCertificates"
	},
	{
		apiFamily: "shopper",
		apiName: "auth",
		apiVersion: "v1",
		clientKey: "shopperLogin"
	},
	{
		apiFamily: "checkout",
		apiName: "shopper-orders",
		apiVersion: "v1",
		clientKey: "shopperOrders"
	},
	{
		apiFamily: "checkout",
		apiName: "shopper-payments",
		apiVersion: "v1",
		clientKey: "shopperPayments"
	},
	{
		apiFamily: "product",
		apiName: "shopper-products",
		apiVersion: "v1",
		clientKey: "shopperProducts"
	},
	{
		apiFamily: "pricing",
		apiName: "shopper-promotions",
		apiVersion: "v1",
		clientKey: "shopperPromotions"
	},
	{
		apiFamily: "search",
		apiName: "shopper-search",
		apiVersion: "v1",
		clientKey: "shopperSearch"
	},
	{
		apiFamily: "site",
		apiName: "shopper-seo",
		apiVersion: "v1",
		clientKey: "shopperSeo"
	},
	{
		apiFamily: "store",
		apiName: "shopper-stores",
		apiVersion: "v1",
		clientKey: "shopperStores"
	}
];
var Available = class extends OAuthCommand {
	static description = "Survey SCAPI schemas available on the active tenant — built-in (overridable) and custom — and report the number of c_* custom attributes each currently has.";
	static examples = ["<%= config.bin %> <%= command.id %>"];
	async run() {
		const { shortCode, tenantId } = this.resolvedConfig.values;
		if (!shortCode) this.error("SCAPI short code required. Provide --short-code, set SFCC_SHORTCODE, or configure short-code in dw.json.");
		if (!tenantId) this.error("tenant-id is required. Provide via --tenant-id flag, SFCC_TENANT_ID env var, or in dw.json.");
		const organizationId = toOrganizationId(tenantId);
		const oauthStrategy = this.getOAuthStrategy();
		const client = createScapiSchemasClient({
			shortCode,
			tenantId
		}, oauthStrategy);
		this.log(`Probing built-in shopper APIs on tenant ${tenantId} for c_* custom attributes...\n`);
		const builtInResults = [];
		for (const api of BUILT_IN_APIS) try {
			const { data, error, response } = await client.GET("/organizations/{organizationId}/schemas/{apiFamily}/{apiName}/{apiVersion}", { params: {
				path: {
					organizationId,
					apiFamily: api.apiFamily,
					apiName: api.apiName,
					apiVersion: api.apiVersion
				},
				query: { expand: "custom_properties" }
			} });
			if (error || !data) {
				builtInResults.push({
					api,
					cAttrCount: 0,
					schemasWithC: [],
					error: `${response.status}`
				});
				continue;
			}
			const schemas = data.components?.schemas ?? {};
			let total = 0;
			const interestingSchemas = [];
			for (const [schemaName, schema] of Object.entries(schemas)) {
				const props = schema?.properties ?? {};
				const cProps = Object.keys(props).filter((k) => k.startsWith("c_"));
				if (cProps.length > 0) {
					total += cProps.length;
					interestingSchemas.push(`${schemaName} (+${cProps.length})`);
				}
			}
			builtInResults.push({
				api,
				cAttrCount: total,
				schemasWithC: interestingSchemas
			});
		} catch (e) {
			builtInResults.push({
				api,
				cAttrCount: 0,
				schemasWithC: [],
				error: e instanceof Error ? e.message : "unknown"
			});
		}
		builtInResults.sort((a, b) => b.cAttrCount - a.cAttrCount);
		const interesting = builtInResults.filter((r) => r.cAttrCount > 0);
		const empty = builtInResults.filter((r) => r.cAttrCount === 0 && !r.error);
		const errored = builtInResults.filter((r) => r.error);
		this.log(`Built-in shopper APIs (${BUILT_IN_APIS.length}):`);
		if (interesting.length > 0) {
			this.log(`\n  Interesting (c_* attributes present) — high-value override targets:\n`);
			for (const r of interesting) {
				this.log(`    ${r.api.clientKey} (${r.cAttrCount} c_* attrs across ${r.schemasWithC.length} schemas)`);
				this.log(`      sfnext scapi add ${r.api.apiFamily} ${r.api.apiName} ${r.api.apiVersion}`);
				if (r.schemasWithC.length <= 8) this.log(`      schemas: ${r.schemasWithC.join(", ")}`);
			}
		}
		if (empty.length > 0) {
			this.log(`\n  No c_* attributes (overridable but no tenant customizations to surface):`);
			for (const r of empty) this.log(`    ${r.api.clientKey}`);
		}
		if (errored.length > 0) {
			this.log(`\n  Errored:`);
			for (const r of errored) this.log(`    ${r.api.clientKey} — ${r.error}`);
		}
		this.log(`\n\nQuerying tenant for custom SCAPI APIs...`);
		const { data: listData, error: listError, response: listResp } = await client.GET("/organizations/{organizationId}/schemas", { params: { path: { organizationId } } });
		if (listError || !listData) {
			this.warn(`Schemas listing failed (${listResp.status}). Custom APIs may exist but cannot be enumerated.`);
			return;
		}
		const listed = listData.schemas ?? [];
		const customApis = [];
		for (const s of listed) {
			if (!s.apiName) continue;
			const clientKey = deriveClientKey(s.apiName);
			if (!isBuiltInClientKey(clientKey)) customApis.push({
				...s,
				clientKey
			});
		}
		if (customApis.length === 0) this.log("  No custom SCAPI APIs registered on this tenant.");
		else {
			this.log(`  Custom APIs (${customApis.length}):\n`);
			for (const s of customApis) {
				this.log(`    ${s.apiFamily}/${s.apiName}/${s.apiVersion}  (clientKey: ${s.clientKey})`);
				this.log(`      sfnext scapi add ${s.apiFamily} ${s.apiName} ${s.apiVersion}`);
			}
		}
	}
};

//#endregion
export { Available as default };