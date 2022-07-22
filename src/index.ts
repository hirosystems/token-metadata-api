import { getEnvVars } from './util/env';
import { BlockchainSmartContractImporter } from './token-processor/blockchain-smart-contract-importer';
import { PgStore } from './pg/pg-store';
import { PgBlockchainApiStore } from './pg/blockchain-api/pg-blockchain-api-store';
import { JobQueue } from './token-processor/queue/job-queue';
import { startApiServer } from './api/init';

export const ENV = getEnvVars();

const pgStore = new PgStore();
const pgBlockchainStore = new PgBlockchainApiStore();
const jobQueue = new JobQueue({ db: pgStore });
const importer = new BlockchainSmartContractImporter({
  db: pgStore,
  apiDb: pgBlockchainStore,
});

importer.importSmartContracts()
  .then(() => {
    jobQueue.start();
    startApiServer({ db: pgStore });
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
