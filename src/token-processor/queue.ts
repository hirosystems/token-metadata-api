import PQueue from 'p-queue';
import { ENV } from '..';
import { PgStore } from '../pg/pg-store';

export abstract class Queue<T> {
  readonly queue: PQueue;
  readonly pgStore: PgStore;

  constructor(args: {
    pgStore: PgStore
  }) {
    this.queue = new PQueue({ concurrency: ENV.METADATA_QUEUE_CONCURRENCY_LIMIT, autoStart: true });
    this.pgStore = args.pgStore;
  }

  abstract add(item: T): void;

  close() {
    this.queue.pause();
    this.queue.clear();
  }
}
