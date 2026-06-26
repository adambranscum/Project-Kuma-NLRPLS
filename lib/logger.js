const winston = require('winston');
const path = require('path');

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaString = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
            return `${timestamp} [${level.toUpperCase()}] ${message}${metaString}`;
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: path.join(__dirname, '..', 'logs', 'error.log'), level: 'error' }),
        new winston.transports.File({ filename: path.join(__dirname, '..', 'logs', 'combined.log') }),
    ],
});

module.exports = logger;
