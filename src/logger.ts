import pino from 'pino';

export const logger = pino({
  name: 'token-metadata-service',
  level: 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label, number) => ({ level: label }),
  },
});
