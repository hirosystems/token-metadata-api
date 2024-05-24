import {
  StacksTransaction,
  StacksTransactionContractDeploymentKind,
} from '@hirosystems/chainhook-client';
import {
  NftMintEvent,
  SftMintEvent,
  TokenMetadataUpdateNotification,
  getContractLogMetadataUpdateNotification,
  getContractLogSftMintEvent,
  getSmartContractSip,
} from '../../token-processor/util/sip-validation';
import { DbSmartContractInsert } from '../types';
import { ClarityAbi } from '@stacks/transactions';
import { ClarityTypeID, decodeClarityValue } from 'stacks-encoding-native-js';

export class BlockCache {
  blockHeight: number;

  contracts: DbSmartContractInsert[] = [];
  notifications: TokenMetadataUpdateNotification[] = [];
  sftMints: SftMintEvent[] = [];
  ftSupplyChanges: Set<string> = new Set();
  nftMints: NftMintEvent[] = [];

  constructor(blockHeight: number) {
    this.blockHeight = blockHeight;
  }

  transaction(tx: StacksTransaction) {
    if (tx.metadata.kind.type === 'ContractDeployment' && tx.metadata.contract_abi) {
      const sip = getSmartContractSip(tx.metadata.contract_abi as ClarityAbi);
      if (sip) {
        const kind = tx.metadata.kind as StacksTransactionContractDeploymentKind;
        this.contracts.push({
          sip,
          principal: kind.data.contract_identifier,
          tx_id: tx.transaction_identifier.hash,
          block_height: this.blockHeight,
        });
      }
    }
    for (const event of tx.metadata.receipt.events) {
      switch (event.type) {
        case 'SmartContractEvent':
          const notification = getContractLogMetadataUpdateNotification(tx.metadata.sender, event);
          if (notification) this.notifications.push(notification);
          const mint = getContractLogSftMintEvent(event);
          if (mint) this.sftMints.push(mint);
          break;
        case 'FTMintEvent':
        case 'FTBurnEvent':
          this.ftSupplyChanges.add(event.data.asset_identifier.split('::')[0]);
          break;
        case 'NFTMintEvent':
          const value = decodeClarityValue(event.data.raw_value);
          if (value.type_id == ClarityTypeID.UInt) {
            this.nftMints.push({
              contractId: event.data.asset_identifier.split('::')[0],
              tokenId: BigInt(value.value),
            });
          }
          break;
      }
    }
  }
}
