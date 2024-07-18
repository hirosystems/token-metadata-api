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
  const predicates: ServerPredicate[] = [];
  if (ENV.CHAINHOOK_AUTO_PREDICATE_REGISTRATION) {
    const blockHeight = await args.db.getChainTipBlockHeight();
    logger.info(`Chainhook predicate starting from block ${blockHeight}...`);
    predicates.push({
      uuid: PREDICATE_UUID,
      name: 'block',
      version: 1,
      chain: 'stacks',
      networks: {
        mainnet: {
          start_block: blockHeight,
          include_contract_abi: true,
          if_this: {
            scope: 'block_height',
            higher_than: 1,
          },
        },
      },
    });
  }

  const opts: ServerOptions = {
    hostname: ENV.API_HOST,
    port: ENV.EVENT_PORT,
    auth_token: ENV.CHAINHOOK_NODE_AUTH_TOKEN,
    external_base_url: `http://${ENV.EXTERNAL_HOSTNAME}`,
    wait_for_chainhook_node: ENV.CHAINHOOK_AUTO_PREDICATE_REGISTRATION,
    validate_chainhook_payloads: false,
    body_limit: ENV.EVENT_SERVER_BODY_LIMIT,
    node_type: 'chainhook',
  };
  const chainhook: ChainhookNodeOptions = {
    base_url: `http://${ENV.CHAINHOOK_NODE_RPC_HOST}:${ENV.CHAINHOOK_NODE_RPC_PORT}`,
  };
  const server = new ChainhookEventObserver(opts, chainhook);
  await server.start(predicates, async (uuid: string, payload: Payload) => {
    logger.info(
      `ChainhookServer received ${
        payload.chainhook.is_streaming_blocks ? 'streamed' : 'replay'
      } payload from predicate ${uuid}`
    );
    await args.db.chainhook.processPayload(payload as StacksPayload);
  });
  const chainTip = await args.db.getChainTipBlockHeight();
  logger.info(`ChainhookServer chain tip is at ${chainTip}`);
  return server;
}
