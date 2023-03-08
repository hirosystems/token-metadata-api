import pino from 'pino';

export const PINO_CONFIG = {
  name: 'token-metadata-api',
  level: 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label: string, number: number) => ({ level: label }),
  },
};
export const logger = pino(PINO_CONFIG);
