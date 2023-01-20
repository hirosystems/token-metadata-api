import * as postgres from 'postgres';
import { PgStore } from '../src/pg/pg-store';
import { buildApiServer } from '../src/api/init';
import { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { IncomingMessage, Server, ServerResponse } from 'http';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  PgBlockchainApiStore,
  BlockchainDbSmartContract,
  BlockchainDbContractLog,
  BlockchainDbBlock,
} from '../src/pg/blockchain-api/pg-blockchain-api-store';

export type TestFastifyServer = FastifyInstance<
  Server,
  IncomingMessage,
  ServerResponse,
  FastifyBaseLogger,
  TypeBoxTypeProvider
>;

export async function startTestApiServer(db: PgStore): Promise<TestFastifyServer> {
  return await buildApiServer({ db });
}

export class MockPgBlockchainApiStore extends PgBlockchainApiStore {
  constructor() {
    super(postgres());
  }

  public smartContract?: BlockchainDbSmartContract;
  getSmartContract(args: { contractId: string }): Promise<BlockchainDbSmartContract | undefined> {
    return Promise.resolve(this.smartContract);
  }

  public contractLog?: BlockchainDbContractLog;
  getSmartContractLog(args: {
    txId: string;
    eventIndex: number;
  }): Promise<BlockchainDbContractLog | undefined> {
    return Promise.resolve(this.contractLog);
  }

  public contractLogsByContract?: BlockchainDbContractLog[];
  getSmartContractLogsByContractCursor(args: {
    contractId: string;
  }): AsyncIterable<BlockchainDbContractLog[]> {
    const logs = this.contractLogsByContract ?? [];
    const iterable: AsyncIterable<BlockchainDbContractLog[]> = {
      [Symbol.asyncIterator]: (): AsyncIterator<BlockchainDbContractLog[], any, undefined> => {
        return {
          next: () => {
            if (logs.length) {
              const value = logs.shift() as BlockchainDbContractLog;
              return Promise.resolve({ value: [value], done: false });
            }
            return Promise.resolve({ value: [] as BlockchainDbContractLog[], done: true });
          },
        };
      },
    };
    return iterable;
  }

  public block?: BlockchainDbBlock;
  getBlock(args: { blockHash: string }): Promise<BlockchainDbBlock | undefined> {
    return Promise.resolve(this.block);
  }
}
