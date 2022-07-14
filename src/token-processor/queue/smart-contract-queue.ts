import { PgStore } from '../../pg/pg-store';
import { DbSmartContractQueueEntry } from '../../pg/types';
import { SmartContractProcessor } from '../smart-contract-processor';
import { Queue } from './queue';
import { TokenQueue } from './token-queue';

export class SmartContractQueue extends Queue<DbSmartContractQueueEntry> {
  private readonly tokenQueue: TokenQueue;

  constructor(args: { db: PgStore; tokenQueue: TokenQueue }) {
    super({ db: args.db });
    this.tokenQueue = args.tokenQueue;
  }

  add(item: DbSmartContractQueueEntry): void {
    this.queue.add(() => {
      const processor = new SmartContractProcessor({ db: this.db, queueEntry: item, tokenQueue: this.tokenQueue });
      processor.process();
    });
  }
}
