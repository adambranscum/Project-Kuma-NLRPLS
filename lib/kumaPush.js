const axios = require('axios');
const logger = require('./logger');

async function pushHeartbeat({ pushUrl, status, msg }) {
    if (!pushUrl) {
        logger.error('Cannot push heartbeat: no push URL provided', { status, msg });
        return;
    }

    const url = `${pushUrl}?status=${encodeURIComponent(status)}&msg=${encodeURIComponent(msg)}`;

    try {
        await axios.get(url, { timeout: 10000 });
        logger.info('Pushed heartbeat to Kuma', { status, msg });
    } catch (err) {
        logger.error('Failed to push heartbeat to Kuma', {
            error: err.message,
            url: pushUrl,
        });
    }
}

module.exports = { pushHeartbeat };
