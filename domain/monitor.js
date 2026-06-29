const logger = require('../lib/logger');
const { pushHeartbeat } = require('../lib/kumaPush');
const { checkOnline, checkSSL, checkDomainExpiration } = require('./domainChecker');

let domainWarnDays;
let sslWarnDays;

// Structured results cache — keyed by domain name, served via /api/domains
const domainCache = {};

/**
 * Derive the env var name for a domain's Kuma push URL.
 * e.g. "my-site.org" -> KUMA_PUSH_DOMAIN_MY_SITE_ORG
 */
function getDomainPushUrl(domain) {
    const key = domain.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    return process.env[`KUMA_PUSH_DOMAIN_${key}`];
}

async function checkDomain(domain) {
    const pushUrl = getDomainPushUrl(domain);
    if (!pushUrl) {
        const envKey = `KUMA_PUSH_DOMAIN_${domain.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
        logger.warn(`Domain monitor: no push URL set for ${domain} (${envKey})`);
    }

    const issues = [];
    const info = [];

    // --- 1. Online / reachability check ---
    const online = await checkOnline(domain);
    if (!online.online) {
        issues.push(`OFFLINE: ${online.error || 'unreachable'}`);
    } else {
        info.push(`${online.protocol.toUpperCase()} ${online.statusCode} (${online.responseTimeMs}ms)`);
    }

    // --- 2. SSL certificate check ---
    const ssl = await checkSSL(domain);
    if (ssl.error) {
        info.push('SSL: N/A');
    } else if (ssl.daysUntilExpiry <= 0) {
        issues.push(`SSL EXPIRED ${Math.abs(ssl.daysUntilExpiry)}d ago`);
    } else if (ssl.daysUntilExpiry <= sslWarnDays) {
        info.push(`SSL expiring ${ssl.daysUntilExpiry}d`);
    } else {
        info.push(`SSL ${ssl.daysUntilExpiry}d`);
    }

    // --- 3. Domain registration expiration check (RDAP) ---
    const reg = await checkDomainExpiration(domain);
    if (reg.error) {
        info.push('RDAP: ERR');
    } else if (reg.daysUntilExpiry !== null) {
        if (reg.daysUntilExpiry <= domainWarnDays) {
            info.push(`Domain expiring ${reg.daysUntilExpiry}d`);
        } else {
            info.push(`Domain ${reg.daysUntilExpiry}d`);
        }
    }

    const status = issues.length === 0 ? 'up' : 'down';
    const msg =
        issues.length > 0
            ? [...issues, ...info].join(' | ')
            : info.join(' | ');

    // Store structured results for the dashboard
    domainCache[domain] = {
        type: 'full',
        checkedAt: new Date().toISOString(),
        online: {
            online: online.online,
            statusCode: online.statusCode || null,
            protocol: online.protocol || null,
            responseTimeMs: online.responseTimeMs || null,
            error: online.error || null,
        },
        ssl: {
            valid: ssl.valid,
            daysUntilExpiry: ssl.daysUntilExpiry ?? null,
            issuer: ssl.issuer || null,
            error: ssl.error || null,
        },
        registration: {
            daysUntilExpiry: reg.daysUntilExpiry ?? null,
            expiresAt: reg.expiresAt ? reg.expiresAt.toISOString() : null,
            registrar: reg.registrar || null,
            error: reg.error || null,
        },
    };

    logger.info(`Domain check: ${domain}`, { status, msg });

    if (pushUrl) {
        await pushHeartbeat({ pushUrl, status, msg });
    }
}

/**
 * Check a registration-only domain — no website, no SSL.
 * Only verifies the domain hasn't expired via RDAP.
 * Marks down only if the domain registration has already lapsed.
 */
async function checkRegOnlyDomain(domain) {
    const pushUrl = getDomainPushUrl(domain);
    if (!pushUrl) {
        const envKey = `KUMA_PUSH_DOMAIN_${domain.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
        logger.warn(`Domain monitor: no push URL set for ${domain} (${envKey})`);
    }

    const reg = await checkDomainExpiration(domain);

    let status, msg;
    if (reg.error) {
        status = 'down';
        msg = `RDAP ERR: ${reg.error}`;
    } else if (reg.daysUntilExpiry === null) {
        status = 'down';
        msg = 'RDAP: no expiration date found';
    } else if (reg.daysUntilExpiry <= 0) {
        status = 'down';
        msg = `EXPIRED ${Math.abs(reg.daysUntilExpiry)}d ago`;
    } else if (reg.daysUntilExpiry <= domainWarnDays) {
        status = 'up';
        msg = `Domain expiring ${reg.daysUntilExpiry}d`;
    } else {
        status = 'up';
        msg = `Domain ${reg.daysUntilExpiry}d`;
    }

    // Store structured results for the dashboard
    domainCache[domain] = {
        type: 'reg-only',
        checkedAt: new Date().toISOString(),
        registration: {
            daysUntilExpiry: reg.daysUntilExpiry ?? null,
            expiresAt: reg.expiresAt ? reg.expiresAt.toISOString() : null,
            registrar: reg.registrar || null,
            error: reg.error || null,
        },
    };

    logger.info(`Domain check (reg-only): ${domain}`, { status, msg });

    if (pushUrl) {
        await pushHeartbeat({ pushUrl, status, msg });
    }
}

function getDomainCache() {
    return {
        thresholds: { ssl: sslWarnDays, domain: domainWarnDays },
        domains: domainCache,
    };
}

async function runDomainChecks() {
    const domainList = (process.env.DOMAIN_LIST || '')
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean);

    const regOnlyList = (process.env.DOMAIN_LIST_REG_ONLY || '')
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean);

    const total = domainList.length + regOnlyList.length;
    if (total === 0) {
        logger.warn('Domain monitor: DOMAIN_LIST and DOMAIN_LIST_REG_ONLY are both empty — no domains to check');
        return;
    }

    logger.info(`Domain monitor: checking ${domainList.length} full + ${regOnlyList.length} reg-only domain(s)`);

    for (const domain of domainList) {
        try {
            await checkDomain(domain);
        } catch (err) {
            logger.error(`Domain monitor: unexpected error for ${domain}`, { error: err.message });
        }
    }

    for (const domain of regOnlyList) {
        try {
            await checkRegOnlyDomain(domain);
        } catch (err) {
            logger.error(`Domain monitor: unexpected error for ${domain}`, { error: err.message });
        }
    }
}

function startDomainMonitor() {
    const intervalMinutes = Number(process.env.DOMAIN_CHECK_INTERVAL_MINUTES) || 60;
    const intervalMs = intervalMinutes * 60 * 1000;
    domainWarnDays = Number(process.env.DOMAIN_EXPIRY_WARN_DAYS) || 30;
    sslWarnDays = Number(process.env.SSL_EXPIRY_WARN_DAYS) || 14;

    logger.info('Starting Domain monitor', { intervalMinutes, domainWarnDays, sslWarnDays });

    runDomainChecks();
    setInterval(runDomainChecks, intervalMs);
}

module.exports = { startDomainMonitor, getDomainCache };
