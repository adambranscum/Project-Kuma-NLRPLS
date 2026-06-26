const { ConfidentialClientApplication } = require('@azure/msal-node');
const logger = require('../lib/logger');

const requiredEnvVars = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET'];

function validateConfig() {
    const missing = requiredEnvVars.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
}

function createMsalClient() {
    validateConfig();

    return new ConfidentialClientApplication({
        auth: {
            clientId: process.env.AZURE_CLIENT_ID,
            authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
            clientSecret: process.env.AZURE_CLIENT_SECRET,
        },
    });
}

let msalClient = null;

async function getAccessToken() {
    if (!msalClient) {
        msalClient = createMsalClient();
    }

    const result = await msalClient.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default'],
    });

    if (!result || !result.accessToken) {
        throw new Error('Failed to acquire access token from Azure AD');
    }

    logger.debug('Acquired Graph access token', { expiresOn: result.expiresOn });
    return result.accessToken;
}

module.exports = { getAccessToken };
