import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FtRoutes } from './api/ft';
import { NftRoutes } from './api/nft';
import { getEnvVars } from './util/env';
import { BlockchainSmartContractImporter } from './token-processor/blockchain-smart-contract-importer';
import { ChainID } from '@stacks/transactions';
import { PgStore } from './pg/pg-store';
import { PgBlockchainApiStore } from './pg/blockchain-api/pg-blockchain-api-store';
import { SmartContractQueue } from './token-processor/queue/smart-contract-queue';
import { TokenQueue } from './token-processor/queue/token-queue';

export const ENV = getEnvVars();

const pgStore = new PgStore();
const pgBlockchainStore = new PgBlockchainApiStore();
const tokenQueue = new TokenQueue({ db: pgStore });
const smartContractQueue = new SmartContractQueue({ db: pgStore, tokenQueue: tokenQueue });

const importer = new BlockchainSmartContractImporter({
  db: pgStore,
  apiDb: pgBlockchainStore,
  smartContractQueue: smartContractQueue,
  chainId: ChainID.Mainnet
});
importer.importSmartContracts().catch(error => {
  console.error(error);
  process.exit(1);
});

// const fastify = Fastify({
//   trustProxy: true,
//   logger: true,
// }).withTypeProvider<TypeBoxTypeProvider>();

// fastify.register(FtRoutes);
// fastify.register(NftRoutes);

// fastify.get('/', (request, reply) => {
//   reply.send({ status: 'ok' });
// });

// fastify.listen({ port: 3000 }, (err, address) => {
//   if (err) {
//     fastify.log.error(err)
//     // process.exit(1)
//   }
// });
