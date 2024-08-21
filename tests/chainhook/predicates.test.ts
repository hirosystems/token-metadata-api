import { Interceptable, MockAgent, setGlobalDispatcher } from 'undici';
import { ENV } from '../../src/env';
import {
  closeChainhookServer,
  getPersistedPredicateFromDisk,
  persistPredicateToDisk,
  startChainhookServer,
} from '../../src/chainhook/server';
import { MIGRATIONS_DIR, PgStore } from '../../src/pg/pg-store';
import { cycleMigrations } from '@hirosystems/api-toolkit';
import { ChainhookEventObserver } from '@hirosystems/chainhook-client';

describe('predicates', () => {
  let db: PgStore;
  let mockAgent: MockAgent;
  let mockClient: Interceptable;
  let server: ChainhookEventObserver;

  beforeAll(async () => {
    ENV.CHAINHOOK_PREDICATE_PATH = './tmp';
    ENV.CHAINHOOK_AUTO_PREDICATE_REGISTRATION = true;
    ENV.PGDATABASE = 'postgres';
    db = await PgStore.connect({ skipMigrations: true });
    await cycleMigrations(MIGRATIONS_DIR);
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(() => {
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    mockClient = mockAgent.get('http://127.0.0.1:20456');
    mockClient
      .intercept({
        path: '/ping',
        method: 'GET',
      })
      .reply(200);
    setGlobalDispatcher(mockAgent);
  });

  afterEach(async () => {
    mockClient
      .intercept({
        path: /\/v1\/chainhooks\/stacks\/(.*)/,
        method: 'DELETE',
      })
      .reply(200);
    await closeChainhookServer(server);
    await mockAgent.close();
  });

  test('registers and persists new predicate to disk', async () => {
    mockClient
      .intercept({
        path: /\/v1\/chainhooks\/(.*)/,
        method: 'GET',
      })
      .reply(200, { status: 404 }); // New predicate
    mockClient
      .intercept({
        path: '/v1/chainhooks',
        method: 'POST',
      })
      .reply(200);
    server = await startChainhookServer({ db });
    expect(getPersistedPredicateFromDisk()).not.toBeUndefined();
    mockAgent.assertNoPendingInterceptors();
  });

  test('resumes predicate stored on disk', async () => {
    persistPredicateToDisk({
      uuid: 'e2777d77-473a-4c1d-9012-152deb36bf4c',
      name: 'test',
      version: 1,
      chain: 'stacks',
      networks: {
        mainnet: {
          start_block: 1,
          include_contract_abi: true,
          if_this: {
            scope: 'block_height',
            higher_than: 1,
          },
        },
      },
    });
    mockClient
      .intercept({
        path: '/v1/chainhooks/e2777d77-473a-4c1d-9012-152deb36bf4c',
        method: 'GET',
      })
      .reply(200, { result: { enabled: true, status: { type: 'scanning' } }, status: 200 });
    server = await startChainhookServer({ db });
    mockAgent.assertNoPendingInterceptors();
  });
});
