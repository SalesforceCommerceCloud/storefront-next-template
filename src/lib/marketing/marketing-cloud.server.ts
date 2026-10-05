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
import { type RouterContextProvider } from 'react-router';
import { createRemoteJWKSet, decodeJwt, type JWTPayload, jwtVerify } from 'jose';
import { getAppOrigin } from '@/lib/origin';
import { getConfig } from '@salesforce/storefront-next-runtime/config';

/**
 * Tokens are valid for 20 minutes. We store it at the top level scope to reuse
 * it during the lambda invocation. We'll refresh it after 15 minutes.
 */
let marketingCloudToken = '';
let marketingCloudTokenExpiration: Date | undefined;

/**
 * Reset the Marketing Cloud token cache (for testing purposes)
 */
export function resetMarketingCloudTokenCache() {
    marketingCloudToken = '';
    marketingCloudTokenExpiration = undefined;
}

/**
 * Sends an email to a specified contact using the Marketing Cloud API.
 * @param emailId - The recipient's email address
 * @param magicLink - The magic link URL to include in the email
 * @param templateId - The Marketing Cloud email template ID to use
 */
export async function sendMarketingCloudEmail(emailId: string, magicLink: string, templateId: string): Promise<object> {
    // Validate required environment variables
    const clientId = process.env.MARKETING_CLOUD_CLIENT_ID;
    const clientSecret = process.env.MARKETING_CLOUD_CLIENT_SECRET;
    const subdomain = process.env.MARKETING_CLOUD_SUBDOMAIN;

    if (!clientId) {
        throw new Error('MARKETING_CLOUD_CLIENT_ID is not set in the environment variables.');
    }

    if (!clientSecret) {
        throw new Error('MARKETING_CLOUD_CLIENT_SECRET is not set in the environment variables.');
    }

    if (!subdomain) {
        throw new Error('MARKETING_CLOUD_SUBDOMAIN is not set in the environment variables.');
    }

    // Refresh token if expired or not set
    if (!marketingCloudTokenExpiration || new Date() > marketingCloudTokenExpiration) {
        const tokenUrl = `https://${subdomain}.auth.marketingcloudapis.com/v2/token`;

        const tokenResponse = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                grant_type: 'client_credentials',
                client_id: clientId,
                client_secret: clientSecret,
            }),
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            throw new Error(`Failed to get Marketing Cloud token: ${tokenResponse.statusText} - ${errorText}`);
        }

        const tokenData = await tokenResponse.json();
        marketingCloudToken = tokenData.access_token;
        // Set expiration to 15 minutes from now (tokens are valid for 20 minutes)
        marketingCloudTokenExpiration = new Date(Date.now() + 15 * 60 * 1000);
    }

    // Send the email
    const uniqueId = crypto.randomUUID().replace(/-/g, '');
    const emailUrl = `https://${subdomain}.rest.marketingcloudapis.com/messaging/v1/email/messages/${uniqueId}`;

    const emailPayload = {
        definitionKey: templateId,
        recipient: {
            contactKey: emailId,
            to: emailId,
            attributes: { 'magic-link': magicLink },
        },
    };

    const emailResponse = await fetch(emailUrl, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${marketingCloudToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailPayload),
    });

    if (!emailResponse.ok) {
        const errorText = await emailResponse.text();
        throw new Error(
            `Failed to send email to Marketing Cloud. Status: ${emailResponse.status}, Response: ${errorText}`
        );
    }

    return await emailResponse.json();
}

/**
 * Validates the SLAS callback token
 */
export async function validateSlasCallbackToken(
    context: Readonly<RouterContextProvider>,
    token: string
): Promise<JWTPayload> {
    const payload = decodeJwt(token);
    const issClaim = payload.iss;
    if (!issClaim) {
        throw new Error('Invalid token: missing or invalid issuer claim');
    }

    const tokens = issClaim.split('/');
    const tenantId = tokens[2];
    if (!tenantId) {
        throw new Error('Invalid token: unable to extract tenant ID');
    }

    try {
        const jwks = createJWKSet(context, tenantId);
        const { payload: validatedPayload } = await jwtVerify(token, jwks, {});
        return validatedPayload;
    } catch (error) {
        throw new Error(`SLAS Token Validation Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Creates a remote JWK Set for validating SLAS callback tokens using the local JWKS proxy
 */
function createJWKSet(context: Readonly<RouterContextProvider>, tenantId: string) {
    const appOrigin = getAppOrigin(context);
    const config = getConfig(context);
    if (!config) {
        throw new Error('Runtime configuration not found in context');
    }

    const organizationId = config.commerce.api.organizationId;
    const configTenantId = organizationId.replace(/^f_ecom_/, '');

    // Validate that the token's tenant matches our configuration
    if (tenantId !== configTenantId) {
        throw new Error(
            `The tenant ID in your configuration ("${configTenantId}") does not match the tenant ID in the SLAS callback token ("${tenantId}").`
        );
    }

    // Use local JWKS proxy endpoint which handles caching and upstream fetching
    const JWKS_URI = `${appOrigin}/oauth2/jwks`;
    return createRemoteJWKSet(new URL(JWKS_URI));
}
