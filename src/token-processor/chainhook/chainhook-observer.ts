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
import { DbSipNumber, DbTokenType } from '../../pg/types';
import { ENV } from '../../env';
import { logger } from '@hirosystems/api-toolkit';
import {
  getContractLogMetadataUpdateNotification,
  getContractLogSftMintEvent,
  getSmartContractSip,
} from '../util/sip-validation';
import { ContractNotFoundError } from '../../pg/errors';
import { StacksNodeRpcClient } from '../stacks-node/stacks-node-rpc-client';
import { ClarityAbi } from '@stacks/transactions';

const PRINT_PREDICATE_UUID = randomUUID();
const CONTRACT_PREDICATE_UUID = randomUUID();

async function handlePrintEvent(db: PgStore, payload: Payload): Promise<void> {
  for (const stacksEvent of payload.apply) {
    const event = stacksEvent as StacksEvent;
    for (const tx of event.transactions) {
      for (const txEvent of tx.metadata.receipt.events) {
        if (txEvent.type === 'SmartContractEvent') {
          // SIP-019 notification?
          const notification = getContractLogMetadataUpdateNotification(
            tx.metadata.sender,
            txEvent
          );
          if (notification) {
            logger.info(
              `ChainhookObserver detected SIP-019 notification for ${notification.contract_id} ${
                notification.token_ids ?? []
              }`
            );
            try {
              await db.enqueueTokenMetadataUpdateNotification({ notification });
            } catch (error) {
              if (error instanceof ContractNotFoundError) {
                logger.warn(
                  `ChainhookObserver contract ${notification.contract_id} not found, unable to process SIP-019 notification`
                );
              } else {
                throw error;
              }
            }
            continue;
          }
          // SIP-013 SFT mint?
          const mint = getContractLogSftMintEvent(txEvent);
          if (mint) {
            const contract = await db.getSmartContract({ principal: mint.contractId });
            if (contract && contract.sip === DbSipNumber.sip013) {
              await db.insertAndEnqueueTokenArray([
                {
                  smart_contract_id: contract.id,
                  type: DbTokenType.sft,
                  token_number: mint.tokenId.toString(),
                },
              ]);
              logger.info(
                `ChainhookObserver detected SIP-013 SFT mint event for ${mint.contractId} ${mint.tokenId}`
              );
            }
          }
        }
      }
    }
    await db.updateChainTipBlockHeight({ blockHeight: event.block_identifier.index });
  }
  // TODO: Rollback
  await db.enqueueDynamicTokensDueForRefresh();
}

async function handleContractDeploy(db: PgStore, payload: Payload): Promise<void> {
  for (const stacksEvent of payload.apply) {
    const event = stacksEvent as StacksEvent;
    for (const tx of event.transactions) {
      const kind = tx.metadata.kind;
      if (kind.type === 'ContractDeployment') {
        // Get contract ABI
        let abi: ClarityAbi | undefined;
        try {
          const client = StacksNodeRpcClient.create({
            contractPrincipal: kind.data.contract_identifier,
          });
          abi = await client.readContractInterface();
          if (!abi) continue;
        } catch (error) {
          logger.error(
            error,
            `ChainhookObserver unable to read ABI for ${kind.data.contract_identifier}`
          );
          continue;
        }
        // Is this a token contract?
        const sip = getSmartContractSip(abi);
        if (!sip) continue;
        await db.insertAndEnqueueSmartContract({
          values: {
            sip,
            abi,
            principal: kind.data.contract_identifier,
            tx_id: tx.transaction_identifier.hash,
            block_height: event.block_identifier.index,
          },
        });
        logger.info(`ChainhookObserver detected (${sip}): ${kind.data.contract_identifier}`);
      }
    }
    await db.updateChainTipBlockHeight({ blockHeight: event.block_identifier.index });
  }
  // TODO: Rollback
  await db.enqueueDynamicTokensDueForRefresh();
}

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
            implement_trait: '*',
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
        await handlePrintEvent(db, payload);
        break;
      case CONTRACT_PREDICATE_UUID:
        await handleContractDeploy(db, payload);
        break;
      default:
        logger.warn({ uuid }, `ChainhookObserver received an unexpected payload`);
        break;
    }
  });
  return server;
}
