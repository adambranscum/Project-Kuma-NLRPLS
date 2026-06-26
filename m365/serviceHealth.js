const axios = require('axios');
const { getAccessToken } = require('./auth');
const logger = require('../lib/logger');

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';
const HEALTHY_STATUSES = new Set(['serviceOperational']);

async function fetchHealthOverviews() {
    const token = await getAccessToken();

    const response = await axios.get(`${GRAPH_BASE_URL}/admin/serviceAnnouncement/healthOverviews`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
    });

    if (!response.data || !Array.isArray(response.data.value)) {
        throw new Error('Unexpected response shape from Graph healthOverviews endpoint');
    }

    return response.data.value;
}

function evaluateHealth(services) {
    const unhealthy = [];
    const healthy = [];

    for (const service of services) {
        const status = service.status;
        if (HEALTHY_STATUSES.has(status)) {
            healthy.push(service);
        } else {
            unhealthy.push(service);
        }
    }

    return { healthy, unhealthy };
}

async function getServiceHealthSummary() {
    const services = await fetchHealthOverviews();
    const { healthy, unhealthy } = evaluateHealth(services);

    logger.info('Fetched M365 service health overview', {
        totalServices: services.length,
        healthyCount: healthy.length,
        unhealthyCount: unhealthy.length,
    });

    if (unhealthy.length > 0) {
        logger.warn('Services not reporting operational status', {
            services: unhealthy.map((s) => ({ name: s.service, status: s.status })),
        });
    }

    return { healthy, unhealthy, total: services.length };
}

module.exports = { getServiceHealthSummary };
