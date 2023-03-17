import {
  BlockchainImporter,
  SmartContractImportInterruptedError,
} from './token-processor/blockchain-api/blockchain-importer';
import { PgStore } from './pg/pg-store';
import { PgBlockchainApiStore } from './pg/blockchain-api/pg-blockchain-api-store';
import { JobQueue } from './token-processor/queue/job-queue';
import { buildApiServer } from './api/init';
import { BlockchainSmartContractMonitor } from './token-processor/blockchain-api/blockchain-smart-contract-monitor';
import { TokenProcessorMetrics } from './token-processor/token-processor-metrics';
import { registerShutdownConfig } from './shutdown-handler';
import { ENV } from './env';
import { logger } from './logger';
import { buildAdminRpcServer } from './admin-rpc/init';

/**
 * Initializes background services. Only for `default` and `writeonly` run modes.
 * @param db - PgStore
 */
async function initBackgroundServices(db: PgStore) {
  logger.info('Initializing background services...');
  const apiDb = await PgBlockchainApiStore.connect();

  if (process.env.NODE_ENV === 'production') {
    new TokenProcessorMetrics({ db });
  }

  const jobQueue = new JobQueue({ db, apiDb });
  registerShutdownConfig({
    name: 'Job Queue',
    forceKillable: false,
    handler: async () => {
      await jobQueue.close();
    },
  });

  const lastObservedBlockHeight = (await db.getChainTipBlockHeight()) ?? 1;
  const contractImporter = new BlockchainImporter({
    db,
    apiDb,
    // Start importing from the last block height seen by this service.
    startingBlockHeight: lastObservedBlockHeight,
  });
  registerShutdownConfig({
    name: 'Contract Importer',
    forceKillable: false,
    handler: async () => {
      await contractImporter.close();
    },
  });

  const contractMonitor = new BlockchainSmartContractMonitor({ db, apiDb });
  registerShutdownConfig({
    name: 'Contract Monitor',
    forceKillable: false,
    handler: async () => {
      await contractMonitor.stop();
    },
  });

  registerShutdownConfig({
    name: 'Blockchain API DB',
    forceKillable: false,
    handler: async () => {
      await apiDb.close();
    },
  });

  await contractImporter.import();
  await contractMonitor.start();
  jobQueue.start();

  const adminRpcServer = await buildAdminRpcServer({ db, apiDb });
  registerShutdownConfig({
    name: 'Admin RPC Server',
    forceKillable: false,
    handler: async () => {
      await adminRpcServer.close();
    },
  });
  await adminRpcServer.listen({ host: ENV.API_HOST, port: ENV.ADMIN_RPC_PORT });
}

/**
 * Initializes API service. Only for `default` and `readonly` run modes.
 * @param db - PgStore
 */
async function initApiService(db: PgStore) {
  logger.info('Initializing API service...');
  const apiServer = await buildApiServer({ db });
  registerShutdownConfig({
    name: 'API Server',
    forceKillable: false,
    handler: async () => {
      await apiServer.close();
    },
  });

  await apiServer.listen({ host: ENV.API_HOST, port: ENV.API_PORT });
}

async function initApp() {
  logger.info(`Initializing in ${ENV.RUN_MODE} run mode...`);
  const db = await PgStore.connect({ skipMigrations: false });

  if (['default', 'writeonly'].includes(ENV.RUN_MODE)) {
    await initBackgroundServices(db);
  }
  if (['default', 'readonly'].includes(ENV.RUN_MODE)) {
    await initApiService(db);
  }

  registerShutdownConfig({
    name: 'DB',
    forceKillable: false,
    handler: async () => {
      await db.close();
    },
  });
}

registerShutdownConfig();
initApp()
  .then(() => {
    logger.info('App initialized');
  })
  .catch(error => {
    if (error instanceof SmartContractImportInterruptedError) {
      // SIGINT/SIGTERM while contract importer was running, ignore.
      return;
    }
    logger.error(error, `App failed to start`);
    process.exit(1);
  });
