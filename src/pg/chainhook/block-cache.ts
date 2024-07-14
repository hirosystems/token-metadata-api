import {
  BlockIdentifier,
  StacksTransaction,
  StacksTransactionContractDeploymentKind,
} from '@hirosystems/chainhook-client';
import {
  NftMintEvent,
  SftMintEvent,
  SmartContractDeployment,
  TokenMetadataUpdateNotification,
  getContractLogMetadataUpdateNotification,
  getContractLogSftMintEvent,
  getSmartContractSip,
} from '../../token-processor/util/sip-validation';
import { ClarityAbi } from '@stacks/transactions';
import { ClarityTypeID, decodeClarityValue } from 'stacks-encoding-native-js';

export type CachedEvent<T> = {
  event: T;
  tx_id: string;
  tx_index: number;
  event_index?: number;
};

export type CachedFtSupplyDeltaMap = Map<string, bigint>;

function contractPrincipalFromAssetIdentifier(asset_identifier: string): string {
  return asset_identifier.split('::')[0];
}

/**
 * Reads transactions and events from a block received via Chainhook and identifies events we should
 * write to the DB.
 */
export class BlockCache {
  block: BlockIdentifier;

  contracts: CachedEvent<SmartContractDeployment>[] = [];
  notifications: CachedEvent<TokenMetadataUpdateNotification>[] = [];
  sftMints: CachedEvent<SftMintEvent>[] = [];
  nftMints: CachedEvent<NftMintEvent>[] = [];
  ftSupplyDelta: CachedFtSupplyDeltaMap = new Map<string, bigint>();

  constructor(block: BlockIdentifier) {
    this.block = block;
  }

  transaction(tx: StacksTransaction) {
    if (tx.metadata.kind.type === 'ContractDeployment' && tx.metadata.contract_abi) {
      const sip = getSmartContractSip(tx.metadata.contract_abi as ClarityAbi);
      if (sip) {
        const kind = tx.metadata.kind as StacksTransactionContractDeploymentKind;
        this.contracts.push({
          event: { principal: kind.data.contract_identifier, sip },
          tx_id: tx.transaction_identifier.hash,
          tx_index: tx.metadata.position.index,
        });
      }
    }
    for (const event of tx.metadata.receipt.events) {
      switch (event.type) {
        case 'SmartContractEvent':
          const notification = getContractLogMetadataUpdateNotification(tx.metadata.sender, event);
          if (notification) {
            this.notifications.push({
              event: notification,
              tx_id: tx.transaction_identifier.hash,
              tx_index: tx.metadata.position.index,
              event_index: event.position.index,
            });
            continue;
          }
          const mint = getContractLogSftMintEvent(event);
          if (mint) {
            this.sftMints.push({
              event: mint,
              tx_id: tx.transaction_identifier.hash,
              tx_index: tx.metadata.position.index,
              event_index: event.position.index,
            });
            continue;
          }
          break;
        case 'FTMintEvent':
        case 'FTBurnEvent':
          const principal = contractPrincipalFromAssetIdentifier(event.data.asset_identifier);
          const previous = this.ftSupplyDelta.get(principal) ?? 0n;
          let amount = BigInt(event.data.amount);
          if (event.type === 'FTBurnEvent') amount *= -1n;
          this.ftSupplyDelta.set(principal, previous + amount);
          break;
        case 'NFTMintEvent':
          const value = decodeClarityValue(event.data.raw_value);
          if (value.type_id == ClarityTypeID.UInt)
            this.nftMints.push({
              event: {
                contractId: event.data.asset_identifier.split('::')[0],
                tokenId: BigInt(value.value),
              },
              tx_id: tx.transaction_identifier.hash,
              tx_index: tx.metadata.position.index,
              event_index: event.position.index,
            });
          break;
      }
    }
  }
}
