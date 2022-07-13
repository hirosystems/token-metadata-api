import { DbSmartContract } from '../pg/types';
import { Queue } from './queue';

export class SmartContractQueue extends Queue<DbSmartContract> {
  add(item: DbSmartContract): void {
    // this.queue.add();
  }
}
