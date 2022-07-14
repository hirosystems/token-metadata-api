import PQueue from 'p-queue';
import { ENV } from '../..';
import { PgStore } from '../../pg/pg-store';

export abstract class Queue<T> {
  protected readonly queue: PQueue;
  protected readonly db: PgStore;

  constructor(args: {
    db: PgStore
  }) {
    this.db = args.db;
    this.queue = new PQueue({
      concurrency: ENV.METADATA_QUEUE_CONCURRENCY_LIMIT,
      autoStart: true
    });
  }

  abstract add(item: T): void;

  close() {
    this.queue.pause();
    this.queue.clear();
  }
}
