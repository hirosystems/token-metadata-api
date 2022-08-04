import * as prom from 'prom-client';
import { PgStore } from '../pg/pg-store';

interface Metrics {
  /** Job count divided by status */
  jobCount: prom.Gauge<string>;
  /** Smart contract count divided by SIP number */
  smartContractCount: prom.Gauge<string>;
  /** Token count divided by type */
  tokenCount: prom.Gauge<string>;
}

export class TokenProcessorMetrics {
  private readonly metrics: Metrics;

  constructor(args: { db: PgStore }) {
    // TODO: Instead of counting here on-demand, increase and decrease gauges when objects are
    // created. This will be tough since we use cursors and complex insert queries with conflict
    // resolution.
    this.metrics = {
      jobCount: new prom.Gauge({
        name: `job_count`,
        help: 'Job count divided by status',
        labelNames: ['status'],
        async collect() {
          const jobStatusCounts = await args.db.getJobStatusCounts();
          for (const count of jobStatusCounts) {
            this.set({ status: count.status }, count.count);
          }
        },
      }),
      smartContractCount: new prom.Gauge({
        name: `smart_contract_count`,
        help: 'Smart contract count divided by SIP number',
        labelNames: ['sip'],
        async collect() {
          const contractCounts = await args.db.getSmartContractCounts();
          for (const count of contractCounts) {
            this.set({ sip: count.sip }, count.count);
          }
        }
      }),
      tokenCount: new prom.Gauge({
        name: `token_count`,
        help: 'Token count divided by type',
        labelNames: ['type'],
        async collect() {
          const tokenCounts = await args.db.getTokenCounts();
          for (const count of tokenCounts) {
            this.set({ type: count.type }, count.count);
          }
        }
      }),
    };    
  }
}
