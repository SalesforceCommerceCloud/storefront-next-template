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

module.exports = {
  name: 'sfdc-llm-gateway',
  requiredVars: [
    'AI_PROVIDER_LLM_API_URL',
    'AI_PROVIDER_API_KEY',
    'AI_PROVIDER_TENANT_ID',
    'AI_PROVIDER_LLM_MODEL',
    'AI_PROVIDER_CLIENT_FEATURE_ID',
    'AI_PROVIDER_SSL_CERT_PATH',
  ],
  async request(messages) {
    const axios = require('axios');
    const https = require('https');
    const fs = require('fs');

    const apiUrl = process.env.AI_PROVIDER_LLM_API_URL;
    const apiToken = process.env.AI_PROVIDER_API_KEY;
    const tenantId = process.env.AI_PROVIDER_TENANT_ID;
    const sslCaCertPath = process.env.AI_PROVIDER_SSL_CERT_PATH;

    const prompt = messages.map((m) => m.content).join('\n');

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `API_KEY ${apiToken}`,
      'x-client-feature-id': process.env.AI_PROVIDER_CLIENT_FEATURE_ID,
      'x-sfdc-core-tenant-id': tenantId,
    };

    let httpsAgent = undefined;
    if (sslCaCertPath) {
      httpsAgent = new https.Agent({
        ca: fs.readFileSync(sslCaCertPath),
      });
    }

    const data = {
      model: process.env.AI_PROVIDER_LLM_MODEL,
      prompt,
    };

    try {
      const response = await axios.post(apiUrl, data, { headers, httpsAgent });
      return response.data.generations[0].text;
    } catch (error) {
      console.error('AI provider request failed:', error.message, error.response?.data);
      throw error;
    }
  },
};
