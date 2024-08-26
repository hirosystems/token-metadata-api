import * as fs from 'fs';
import {
  ChainhookEventObserver,
  ChainhookNodeOptions,
  Payload,
  ServerOptions,
  ServerPredicate,
  StacksPayload,
} from '@hirosystems/chainhook-client';
import { PgStore } from '../pg/pg-store';
import { ENV } from '../env';
import { logger } from '@hirosystems/api-toolkit';
import { randomUUID } from 'node:crypto';

export function getPersistedPredicateFromDisk(): ServerPredicate | undefined {
  const predicatePath = `${ENV.CHAINHOOK_PREDICATE_PATH}/predicate.json`;
  try {
    if (!fs.existsSync(predicatePath)) {
      return;
    }
    const fileData = fs.readFileSync(predicatePath, 'utf-8');
    return JSON.parse(fileData) as ServerPredicate;
  } catch (error) {
    logger.error(error, `ChainhookServer unable to get persisted predicate`);
  }
}

export function persistPredicateToDisk(predicate: ServerPredicate) {
  const predicatePath = `${ENV.CHAINHOOK_PREDICATE_PATH}/predicate.json`;
  try {
    fs.mkdirSync(ENV.CHAINHOOK_PREDICATE_PATH, { recursive: true });
    fs.writeFileSync(predicatePath, JSON.stringify(predicate, null, 2));
  } catch (error) {
    logger.error(error, `ChainhookServer unable to persist predicate to disk`);
  }
}

export async function startChainhookServer(args: { db: PgStore }): Promise<ChainhookEventObserver> {
  const blockHeight = await args.db.getChainTipBlockHeight();
  logger.info(`ChainhookServer is at block ${blockHeight}`);

  const predicates: ServerPredicate[] = [];
  if (ENV.CHAINHOOK_AUTO_PREDICATE_REGISTRATION) {
    const existingPredicate = getPersistedPredicateFromDisk();
    if (existingPredicate) {
      logger.info(
        `ChainhookServer will attempt to resume existing predicate ${existingPredicate.uuid}`
      );
    }
    const header = {
      uuid: existingPredicate?.uuid ?? randomUUID(),
      name: 'block',
      version: 1,
      chain: 'stacks',
    };
    switch (ENV.NETWORK) {
      case 'mainnet':
        predicates.push({
          ...header,
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
        break;
      case 'testnet':
        predicates.push({
          ...header,
          networks: {
            testnet: {
              start_block: blockHeight,
              include_contract_abi: true,
              if_this: {
                scope: 'block_height',
                higher_than: 1,
              },
            },
          },
        });
        break;
    }
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
  if (predicates.length) persistPredicateToDisk(predicates[0]);
  return server;
}

export async function closeChainhookServer(server: ChainhookEventObserver) {
  try {
    const predicatePath = `${ENV.CHAINHOOK_PREDICATE_PATH}/predicate.json`;
    if (fs.existsSync(predicatePath)) fs.rmSync(predicatePath);
  } catch (error) {
    logger.error(error, `ChainhookServer unable to delete persisted predicate`);
  }
  await server.close();
}
