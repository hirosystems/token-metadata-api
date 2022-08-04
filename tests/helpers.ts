import { ENV } from '../src/env';
import * as ley from 'ley';
import { PgStore } from '../src/pg/pg-store';
import { buildApiServer } from '../src/api/init';

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

export async function startTestApiServer(db: PgStore) {
  const fastify = await buildApiServer({ db });
  await new Promise<void>((resolve, reject) => {
    fastify.listen({ host: '127.0.0.1', port: 9999 }, (err, addr) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    })
  });
  return fastify;
}
