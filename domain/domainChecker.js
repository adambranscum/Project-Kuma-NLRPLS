const tls = require('tls');
const https = require('https');
const axios = require('axios');
const logger = require('../lib/logger');

const insecureHttpsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Check if a domain is reachable via HTTPS (falls back to HTTP).
 * Returns { online, statusCode, responseTimeMs, protocol, error? }
 */
async function checkOnline(domain) {
    const start = Date.now();

    for (const protocol of ['https', 'http']) {
        try {
            const response = await axios.get(`${protocol}://${domain}`, {
                timeout: 10000,
                maxRedirects: 5,
                validateStatus: () => true, // accept any HTTP status — we just want reachability
                ...(protocol === 'https' ? { httpsAgent: insecureHttpsAgent } : {}),
            });
            return {
                online: true,
                statusCode: response.status,
                responseTimeMs: Date.now() - start,
                protocol,
            };
        } catch (err) {
            if (protocol === 'https') continue; // try HTTP before giving up
            return { online: false, error: err.message, responseTimeMs: Date.now() - start };
        }
    }
}

/**
 * Check the SSL/TLS certificate for a domain.
 * Uses a raw TLS connection so it works even on expired certs.
 * Returns { valid, expiresAt, daysUntilExpiry, issuer, error? }
 */
async function checkSSL(domain) {
    return new Promise((resolve) => {
        const socket = tls.connect(
            { host: domain, port: 443, servername: domain, rejectUnauthorized: false },
            () => {
                const cert = socket.getPeerCertificate();
                socket.destroy();

                if (!cert || !cert.valid_to) {
                    return resolve({ valid: false, error: 'No certificate returned' });
                }

                const expiresAt = new Date(cert.valid_to);
                const daysUntilExpiry = Math.floor((expiresAt - Date.now()) / 86_400_000);
                const issuer =
                    cert.issuer?.O || cert.issuer?.CN || 'Unknown';

                resolve({ valid: daysUntilExpiry > 0, expiresAt, daysUntilExpiry, issuer });
            }
        );

        socket.setTimeout(10000, () => {
            socket.destroy();
            resolve({ valid: false, error: 'SSL check timed out' });
        });

        socket.on('error', (err) => {
            resolve({ valid: false, error: err.message });
        });
    });
}

/**
 * Check domain registration expiration via the RDAP protocol (JSON-based WHOIS).
 * Falls back gracefully if the TLD doesn't support RDAP.
 * Returns { expiresAt, daysUntilExpiry, registrar, error? }
 */
async function checkDomainExpiration(domain) {
    try {
        const response = await axios.get(`https://rdap.org/domain/${domain}`, {
            timeout: 15000,
            headers: { Accept: 'application/rdap+json, application/json' },
        });

        const events = response.data.events || [];
        const expEvent = events.find((e) => e.eventAction === 'expiration');

        if (!expEvent) {
            return { expiresAt: null, daysUntilExpiry: null, error: 'No expiration event in RDAP response' };
        }

        const expiresAt = new Date(expEvent.eventDate);
        const daysUntilExpiry = Math.floor((expiresAt - Date.now()) / 86_400_000);

        // Best-effort registrar extraction from vCard entities
        const registrarEntity = (response.data.entities || []).find((e) =>
            Array.isArray(e.roles) && e.roles.includes('registrar')
        );
        const vcardFn = registrarEntity?.vcardArray?.[1]?.find((v) => v[0] === 'fn');
        const registrar = vcardFn?.[3] || 'Unknown';

        return { expiresAt, daysUntilExpiry, registrar };
    } catch (err) {
        logger.warn(`RDAP lookup failed for ${domain}`, { error: err.message });
        return { expiresAt: null, daysUntilExpiry: null, error: err.message };
    }
}

module.exports = { checkOnline, checkSSL, checkDomainExpiration };
