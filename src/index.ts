import { BlockchainImporter } from './token-processor/blockchain-api/blockchain-importer';
import { PgStore } from './pg/pg-store';
import { PgBlockchainApiStore } from './pg/blockchain-api/pg-blockchain-api-store';
import { JobQueue } from './token-processor/queue/job-queue';
import { startApiServer } from './api/init';
import { BlockchainSmartContractMonitor } from './token-processor/blockchain-api/blockchain-smart-contract-monitor';
import { TokenProcessorMetrics } from './token-processor/token-processor-metrics';

const db = new PgStore();
const apiDb = new PgBlockchainApiStore();
const jobQueue = new JobQueue({ db });
const contractImporter = new BlockchainImporter({ db, apiDb });
const metrics = new TokenProcessorMetrics({ db });
// const contractMonitor = new BlockchainSmartContractMonitor({
//   db: pgStore,
//   apiDb: pgBlockchainStore
// });

async function initApp() {
  // Take all smart contracts from the Blockchain API starting from what we already have.
  // This will fill up our job queue.
  await contractImporter.import();
  // Listen for new ones that may come, including SIP-019 notifications.
  // contractMonitor.start();

  // Start the queue and API endpoints.
  // jobQueue.start();
  await startApiServer({ db });
}

initApp()
  .then(() => {})
  .catch(error => console.error(`Unable to launch service`, error));

// Close.
