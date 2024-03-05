import {
  ChainhookEventObserver,
  ChainhookNodeOptions,
  Payload,
  ServerOptions,
  ServerPredicate,
  StacksPayload,
} from '@hirosystems/chainhook-client';
import { randomUUID } from 'node:crypto';
import { PgStore } from '../pg/pg-store';
import { ENV } from '../env';
import { logger } from '@hirosystems/api-toolkit';

const PREDICATE_UUID = randomUUID();

export async function startChainhookServer(args: { db: PgStore }): Promise<ChainhookEventObserver> {
  const blockHeight = await args.db.getChainTipBlockHeight();
  const predicates: ServerPredicate[] = [
    {
      uuid: PREDICATE_UUID,
      name: 'block',
      version: 1,
      chain: 'stacks',
      networks: {
        mainnet: {
          start_block: blockHeight,
          if_this: {
            scope: 'block_height',
            higher_than: 0,
          },
        },
      },
    },
  ];

  const opts: ServerOptions = {
    hostname: ENV.API_HOST,
    port: ENV.EVENT_PORT,
    auth_token: ENV.CHAINHOOK_NODE_AUTH_TOKEN,
    external_base_url: `http://${ENV.EXTERNAL_HOSTNAME}`,
    validate_chainhook_payloads: true,
    body_limit: ENV.EVENT_SERVER_BODY_LIMIT,
    node_type: 'chainhook',
  };
  const chainhook: ChainhookNodeOptions = {
    base_url: `http://${ENV.CHAINHOOK_NODE_RPC_HOST}:${ENV.CHAINHOOK_NODE_RPC_PORT}`,
  };
  logger.info(`ChainhookServer listening for Stacks blocks starting from block ${blockHeight}`);
  const server = new ChainhookEventObserver(opts, chainhook);
  await server.start(predicates, async (uuid: string, payload: Payload) => {
    logger.info(
      `ChainhookServer received ${
        payload.chainhook.is_streaming_blocks ? 'streamed' : 'replay'
      } payload from predicate ${uuid}`
    );
    await args.db.chainhook.processPayload(payload as StacksPayload);
  });
  return server;
}
