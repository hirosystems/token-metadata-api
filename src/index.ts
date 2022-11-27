import { BlockchainImporter } from './token-processor/blockchain-api/blockchain-importer';
import { PgStore } from './pg/pg-store';
import { PgBlockchainApiStore } from './pg/blockchain-api/pg-blockchain-api-store';
import { JobQueue } from './token-processor/queue/job-queue';
import { startApiServer } from './api/init';
import { BlockchainSmartContractMonitor } from './token-processor/blockchain-api/blockchain-smart-contract-monitor';
import { TokenProcessorMetrics } from './token-processor/token-processor-metrics';
import { registerShutdownConfig } from './shutdown-handler';

async function initApp() {
  const db = await PgStore.connect({ skipMigrations: false });
  const apiDb = await PgBlockchainApiStore.connect();

  if (process.env['NODE_ENV'] === 'production') {
    new TokenProcessorMetrics({ db });
  }

  // Take all smart contracts from the Blockchain API starting from what we already have.
  // This will fill up our job queue.
  const contractImporter = new BlockchainImporter({ db, apiDb });
  await contractImporter.import();

  // Listen for new ones that may come, including SIP-019 notifications.
  // const contractMonitor = new BlockchainSmartContractMonitor({
  //   db: pgStore,
  //   apiDb: pgBlockchainStore
  // });
  // contractMonitor.start();

  // Start the job queue.
  const jobQueue = new JobQueue({ db });
  jobQueue.start();
  registerShutdownConfig({
    name: 'Job queue',
    forceKillable: false,
    handler: async () => {
      await jobQueue.close();
    },
  });

  // Start API server.
  const apiServer = await startApiServer({ db });
  registerShutdownConfig({
    name: 'API Server',
    forceKillable: false,
    handler: async () => {
      await apiServer.close();
    },
  });

  registerShutdownConfig({
    name: 'DB',
    forceKillable: false,
    handler: async () => {
      await db.close();
    },
  });
  registerShutdownConfig({
    name: 'Blockchain API DB',
    forceKillable: false,
    handler: async () => {
      await apiDb.close();
    },
  });
}

registerShutdownConfig();
initApp()
  .then(() => {
    console.info('App initialized');
  })
  .catch(error => {
    console.error(`App failed to start`, error);
    process.exit(1);
  });
