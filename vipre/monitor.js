const logger = require('../lib/logger');
const { fetchAllDevices } = require('./vipreClient');
const { evaluateFleet } = require('./deviceHealth');
const { pushHeartbeat } = require('../lib/kumaPush');

let staleThresholdDays;

async function runVipreCheck() {
    const pushUrl = process.env.KUMA_PUSH_URL;

    if (!pushUrl) {
        logger.error('Cannot run Vipre check: KUMA_PUSH_URL not set');
        return;
    }

    try {
        const devices = await fetchAllDevices();
        const summary = evaluateFleet(devices, staleThresholdDays);

        const status = summary.unhealthy.length === 0 ? 'up' : 'down';
        const msg =
            summary.unhealthy.length === 0
                ? `All ${summary.total} devices healthy`
                : `${summary.unhealthy.length} of ${summary.total} devices unhealthy`;

        await pushHeartbeat({ pushUrl, status, msg });
    } catch (err) {
        logger.error('Fleet health check failed', { error: err.message });
        await pushHeartbeat({ pushUrl, status: 'down', msg: `Health check error: ${err.message}` });
    }
}

function startVipreMonitor() {
    const intervalMinutes = Number(process.env.VIPRE_CHECK_INTERVAL_MINUTES) || 15;
    const intervalMs = intervalMinutes * 60 * 1000;
    staleThresholdDays = Number(process.env.STALE_THRESHOLD_DAYS) || 30;

    logger.info('Starting Vipre Endpoint Security monitor', { intervalMinutes, staleThresholdDays });

    runVipreCheck();
    setInterval(runVipreCheck, intervalMs);
}

module.exports = { startVipreMonitor };
