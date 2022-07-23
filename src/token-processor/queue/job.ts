import { PgStore } from "../../pg/pg-store";
import { DbJob } from "../../pg/types";
import { JobQueue } from "./job-queue";

export abstract class Job {
  protected readonly db: PgStore;
  protected readonly job: DbJob;

  constructor(args: {
    db: PgStore;
    job: DbJob;
  }) {
    this.db = args.db;
    this.job = args.job;
  }

  abstract work(): void;
}
