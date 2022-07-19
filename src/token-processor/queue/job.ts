import { PgStore } from "../../pg/pg-store";
import { DbJob } from "../../pg/types";
import { JobQueue } from "./job-queue";

export abstract class Job {
  protected readonly db: PgStore;
  protected readonly queue: JobQueue;
  protected readonly job: DbJob;

  constructor(args: {
    db: PgStore;
    queue: JobQueue;
    job: DbJob;
  }) {
    this.db = args.db;
    this.queue = args.queue;
    this.job = args.job;
  }

  abstract work(): void;
}
