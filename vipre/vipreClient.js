const axios = require('axios');
const logger = require('../lib/logger');

const BASE_URL = 'https://api.myvipre.com/api/v1';
const PAGE_SIZE = 100;

function getAuthHeaders() {
    const keyId = process.env.VIPRE_KEY_ID;
    const apiKey = process.env.VIPRE_API_KEY;

    if (!keyId || !apiKey) {
        throw new Error('Missing VIPRE_KEY_ID or VIPRE_API_KEY environment variables');
    }

    return {
        'X-Vipre-Endpoint-Key-Id': keyId,
        'X-Vipre-Endpoint-Api-Key': apiKey,
    };
}

async function fetchAllDevices() {
    const headers = getAuthHeaders();
    const devices = [];
    let offset = 0;

    while (true) {
        const response = await axios.get(`${BASE_URL}/ext/devices`, {
            headers,
            params: { limit: PAGE_SIZE, offset },
            timeout: 20000,
        });

        const data = response.data;

        if (!data || !Array.isArray(data.devices)) {
            throw new Error('Unexpected response shape from Vipre devices endpoint');
        }

        devices.push(...data.devices);

        if (data.devices.length < PAGE_SIZE) {
            break;
        }

        offset += PAGE_SIZE;

        logger.debug('Fetched device page', { offset, pageCount: data.devices.length });
    }

    return devices;
}

module.exports = { fetchAllDevices };
