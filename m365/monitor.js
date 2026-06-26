const logger = require('../lib/logger');
const { getServiceHealthSummary } = require('./serviceHealth');
const { pushHeartbeat } = require('../lib/kumaPush');

const TRACKED_SERVICES = [
    { id: 'Exchange', label: 'Exchange Online', envVar: 'KUMA_PUSH_EXCHANGE' },
    { id: 'SharePoint', label: 'SharePoint Online', envVar: 'KUMA_PUSH_SHAREPOINT' },
    { id: 'microsoftteams', label: 'Microsoft Teams', envVar: 'KUMA_PUSH_TEAMS' },
    { id: 'OneDriveForBusiness', label: 'OneDrive for Business', envVar: 'KUMA_PUSH_ONEDRIVE' },
    { id: 'OSDPPlatform', label: 'Microsoft 365 suite', envVar: 'KUMA_PUSH_M365SUITE' },
    { id: 'AAD', label: 'Microsoft Entra', envVar: 'KUMA_PUSH_ENTRA' },
    { id: 'MicrosoftFlow', label: 'Power Automate', envVar: 'KUMA_PUSH_POWERAUTOMATE' },
    { id: 'OfficeOnline', label: 'Office for the web', envVar: 'KUMA_PUSH_OFFICEWEB' },
    { id: 'MicrosoftForms', label: 'Microsoft Forms', envVar: 'KUMA_PUSH_FORMS' },
];

async function pushServiceStatus(tracked, allServices) {
    const pushUrl = process.env[tracked.envVar];
    if (!pushUrl) {
        logger.error('Skipping push: env var not set', { service: tracked.label, envVar: tracked.envVar });
        return;
    }

    const match = allServices.find((s) => s.id === tracked.id);

    if (!match) {
        logger.warn('Tracked service not found in Graph response', { service: tracked.label, id: tracked.id });
        await pushHeartbeat({
            pushUrl,
            status: 'down',
            msg: `${tracked.label}: not returned by Graph (check id mapping)`,
        });
        return;
    }

    const isHealthy = match.status === 'serviceOperational';
    const status = isHealthy ? 'up' : 'down';
    const msg = isHealthy ? `${tracked.label}: operational` : `${tracked.label}: ${match.status}`;

    await pushHeartbeat({ pushUrl, status, msg });
}

async function runM365Check() {
    try {
        const summary = await getServiceHealthSummary();
        const allServices = [...summary.healthy, ...summary.unhealthy];

        for (const tracked of TRACKED_SERVICES) {
            await pushServiceStatus(tracked, allServices);
        }
    } catch (err) {
        logger.error('M365 health check run failed', { error: err.message });

        for (const tracked of TRACKED_SERVICES) {
            const pushUrl = process.env[tracked.envVar];
            if (pushUrl) {
                await pushHeartbeat({
                    pushUrl,
                    status: 'down',
                    msg: `${tracked.label}: health check error - ${err.message}`,
                });
            }
        }
    }
}

function startM365Monitor() {
    const intervalMinutes = Number(process.env.M365_CHECK_INTERVAL_MINUTES) || 10;
    const intervalMs = intervalMinutes * 60 * 1000;

    logger.info('Starting M365 service health monitor', {
        intervalMinutes,
        trackedServices: TRACKED_SERVICES.map((s) => s.label),
    });

    runM365Check();
    setInterval(runM365Check, intervalMs);
}

module.exports = { startM365Monitor };
