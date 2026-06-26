const logger = require('../lib/logger');

const HEALTHY_STATUS = 'PROTECTED';

function isStale(lastContactTimestamp, staleThresholdDays) {
    const thresholdMs = staleThresholdDays * 24 * 60 * 60 * 1000;
    const ageMs = Date.now() - lastContactTimestamp;
    return ageMs > thresholdMs;
}

function evaluateDevice(device, staleThresholdDays) {
    const reasons = [];

    if (device.status !== HEALTHY_STATUS) {
        reasons.push(`status is ${device.status}`);
    }

    if (isStale(device.lastContactTimestamp, staleThresholdDays)) {
        const daysSinceContact = Math.floor((Date.now() - device.lastContactTimestamp) / (24 * 60 * 60 * 1000));
        reasons.push(`last contact ${daysSinceContact} days ago`);
    }

    return {
        healthy: reasons.length === 0,
        reasons,
    };
}

function evaluateFleet(devices, staleThresholdDays) {
    const unhealthy = [];
    const healthy = [];

    for (const device of devices) {
        const result = evaluateDevice(device, staleThresholdDays);
        if (result.healthy) {
            healthy.push(device);
        } else {
            unhealthy.push({ device, reasons: result.reasons });
        }
    }

    logger.info('Evaluated Vipre fleet health', {
        totalDevices: devices.length,
        healthyCount: healthy.length,
        unhealthyCount: unhealthy.length,
    });

    for (const { device, reasons } of unhealthy) {
        logger.warn('Unhealthy device detected', {
            name: device.name,
            siteUuid: device.siteUuid,
            agentUuid: device.agentUuid,
            status: device.status,
            lastContactTimestamp: device.lastContactTimestamp,
            reasons,
        });
    }

    return { healthy, unhealthy, total: devices.length };
}

module.exports = { evaluateFleet };
