import {
  ChainhookEventObserver,
  ChainhookNodeOptions,
  Payload,
  ServerOptions,
  ServerPredicate,
  StacksEvent,
} from '@hirosystems/chainhook-client';
import { randomUUID } from 'node:crypto';
import { PgStore } from '../../pg/pg-store';
import { DbSipNumber } from '../../pg/types';
import { ENV } from '../../env';
import { TxPayloadTypeID, decodeClarityValue, decodeTransaction } from 'stacks-encoding-native-js';

const PREDICATE_UUID = randomUUID();

async function processPayload(payload: Payload): Promise<void> {
  for (const stacksEvent of payload.apply) {
    const event = stacksEvent as StacksEvent;
    for (const tx of event.transactions) {
      if (tx.metadata.kind.type === 'ContractDeployment') {
        const dec = decodeTransaction(tx.metadata.raw_tx);
        if (dec.payload.type_id === TxPayloadTypeID.SmartContract) {
          // dec.payload.code_body
          decodeClarityValue
        }
      }
    }
  }
}

export async function startChainhookObserver(db: PgStore): Promise<ChainhookEventObserver> {
  const predicate: ServerPredicate = {
    uuid: PREDICATE_UUID,
    name: 'block_height',
    version: 1,
    chain: 'stacks',
    networks: {
      mainnet: {
        // TODO: start block
        start_block: 0,
        if_this: {
          scope: 'block_height',
          higher_than: 0,
        },
      },
    },
  };

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

  const server = new ChainhookEventObserver(opts, chainhook);
  await server.start([predicate], async (uuid: string, payload: Payload) => {
    await processPayload(payload);
  });
  return server;
}
