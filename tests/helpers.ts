import { ENV } from '../src/util/env';
import * as ley from 'ley';

export async function cycleMigrations() {
  const config = {
    host: ENV.PGHOST,
    port: ENV.PGPORT,
    user: ENV.PGUSER,
    password: ENV.PGPASSWORD,
    database: ENV.PGDATABASE
  };
  await ley.down({
    all: true,
    dir: 'migrations',
    driver: 'postgres',
    config: config
  });
  await ley.up({
    dir: 'migrations',
    driver: 'postgres',
    config: config
  });
}
