/**
 * Structured Logger — Pino-based logging for the entire backend.
 *
 * Usage:
 *   const logger = require('./services/logger');
 *   logger.info({ ticker: 'AAPL' }, 'Processing stock');
 *   logger.error({ err }, 'Pipeline failed');
 *
 * Child loggers for modules:
 *   const log = require('./services/logger').child({ module: 'pipeline' });
 *   log.info('Stage 1 started');
 */

const pino = require('pino');

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const logger = pino({
  level: isTest ? 'silent' : (process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug')),
  transport: isProduction ? undefined : {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname',
    },
  },
});

module.exports = logger;
