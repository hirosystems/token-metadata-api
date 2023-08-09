import {
  ChainhookEventObserver,
  ChainhookNodeOptions,
  Payload,
  ServerOptions,
  ServerPredicate,
} from '@hirosystems/chainhook-client';
import { randomUUID } from 'node:crypto';
import { PgStore } from '../../pg/pg-store';
import { ENV } from '../../env';
import { logger } from '@hirosystems/api-toolkit';

const PRINT_PREDICATE_UUID = randomUUID();
const CONTRACT_PREDICATE_UUID = randomUUID();

export async function startChainhookObserver(db: PgStore): Promise<ChainhookEventObserver> {
  const blockHeight = await db.getChainTipBlockHeight();
  const predicates: ServerPredicate[] = [
    {
      uuid: PRINT_PREDICATE_UUID,
      name: 'print_event',
      version: 1,
      chain: 'stacks',
      networks: {
        mainnet: {
          start_block: blockHeight,
          if_this: {
            scope: 'print_event',
            contract_identifier: '*',
            contains: '*',
          },
        },
      },
    },
    {
      uuid: CONTRACT_PREDICATE_UUID,
      name: 'contract_deployment',
      version: 1,
      chain: 'stacks',
      networks: {
        mainnet: {
          start_block: blockHeight,
          if_this: {
            scope: 'contract_deployment',
            deployer: '*',
          },
        },
      },
    },
  ];

  // Local server options
  const opts: ServerOptions = {
    hostname: ENV.API_HOST,
    port: ENV.EVENT_PORT,
    auth_token: ENV.CHAINHOOK_NODE_AUTH_TOKEN,
    external_base_url: `http://${ENV.EXTERNAL_HOSTNAME}`,
  };

  // Chainhook node options
  const chainhook: ChainhookNodeOptions = {
    base_url: `http://${ENV.CHAINHOOK_NODE_RPC_HOST}:${ENV.CHAINHOOK_NODE_RPC_PORT}`,
  };

  logger.info(`ChainhookObserver listening for Stacks events starting from block ${blockHeight}`);
  const server = new ChainhookEventObserver(opts, chainhook);
  await server.start(predicates, async (uuid: string, payload: Payload) => {
    switch (uuid) {
      case PRINT_PREDICATE_UUID:
        await db.updatePrintEvent(payload);
        break;
      case CONTRACT_PREDICATE_UUID:
        await db.updateContractDeployment(payload);
        break;
      default:
        logger.warn({ uuid }, `ChainhookObserver received an unexpected payload`);
        break;
    }
  });
  return server;
}
