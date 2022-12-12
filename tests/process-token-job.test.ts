import { cvToHex, noneCV, stringUtf8CV, uintCV } from '@stacks/transactions';
import { MockAgent, setGlobalDispatcher } from 'undici';
import { PgStore } from '../src/pg/pg-store';
import {
  DbJob,
  DbJobStatus,
  DbMetadataAttribute,
  DbMetadataProperty,
  DbSipNumber,
  DbSmartContractInsert,
  DbTokenType,
} from '../src/pg/types';
import { ENV } from '../src/env';
import { cycleMigrations } from '../src/pg/migrations';
import { ProcessTokenJob } from '../src/token-processor/queue/job/process-token-job';

describe('ProcessTokenJob', () => {
  let db: PgStore;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    db = await PgStore.connect({ skipMigrations: true });
    await cycleMigrations();
  });

  afterEach(async () => {
    await db.close();
  });

  describe('FT', () => {
    let tokenJob: DbJob;

    beforeEach(async () => {
      const values: DbSmartContractInsert = {
        principal: 'ABCD.test-ft',
        sip: DbSipNumber.sip010,
        abi: '"some"',
        tx_id: '0x123456',
        block_height: 1,
      };
      await db.insertAndEnqueueSmartContract({ values });
      [tokenJob] = await db.insertAndEnqueueTokens({
        smart_contract_id: 1,
        token_count: 1,
        type: DbTokenType.ft,
      });
    });

    test('parses FT info', async () => {
      const agent = new MockAgent();
      agent.disableNetConnect();
      const interceptor = agent.get(
        `http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`
      );
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-name',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(stringUtf8CV('FooToken')),
        });
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-token-uri',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(noneCV()), // We'll do that in another test
        });
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-symbol',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(stringUtf8CV('FOO')),
        });
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-decimals',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(uintCV(6)),
        });
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-total-supply',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(uintCV(1997500000000)),
        });
      setGlobalDispatcher(agent);

      const processor = new ProcessTokenJob({ db, job: tokenJob });
      await processor.work();

      const token = await db.getToken({ id: 1 });
      expect(token).not.toBeUndefined();
      expect(token?.name).toBe('FooToken');
      expect(token?.symbol).toBe('FOO');
      expect(token?.decimals).toBe(6);
      expect(token?.total_supply).toBe(1997500000000n);
    });
  });

  describe('NFT', () => {
    let tokenJob: DbJob;

    beforeEach(async () => {
      const values: DbSmartContractInsert = {
        principal: 'ABCD.test-nft',
        sip: DbSipNumber.sip009,
        abi: '"some"',
        tx_id: '0x123456',
        block_height: 1,
      };
      await db.insertAndEnqueueSmartContract({ values });
      [tokenJob] = await db.insertAndEnqueueTokens({
        smart_contract_id: 1,
        token_count: 1,
        type: DbTokenType.nft,
      });
    });

    test('parses metadata with arbitrary types', async () => {
      const metadata = {
        name: 'Mutant Monkeys #1',
        image:
          'https://byzantion.mypinata.cloud/ipfs/QmWAYP9LJD15mgrnapfpJhBArG6T3J4XKTM77tzqggvP7w',
        attributes: [
          {
            trait_type: 'Background',
            value: 'MM1 Purple',
          },
          {
            trait_type: 'Fur',
            value: 5050,
            display_type: 'Number',
          },
          {
            trait_type: 'Clothes',
            value: ['hello', 'world'],
          },
        ],
        properties: {
          external_url: 'https://bitcoinmonkeys.io/',
          description:
            "Mutant Monkeys is a collection of 5,000 NFT's that were created by transforming a Bitcoin Monkeys Labs vial of Serum into a Mutant Monkey.",
          colection_name: 'Mutant Monkeys',
          collection_image:
            'https://byzantion.mypinata.cloud/ipfs/QmcsJmDdzutRYWg8e6E4Vqrs2Yon79BHfb14U3WnitwZSQ',
          collection_size: 5000,
          artist: 'Bitcoin Monkeys',
          prop: { a: 1, b: 2 },
        },
      };
      const agent = new MockAgent();
      agent.disableNetConnect();
      agent
        .get(`http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`)
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-nft/get-token-uri',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(stringUtf8CV('http://m.io/{id}.json')),
        });
      agent
        .get(`http://m.io`)
        .intercept({
          path: '/1.json',
          method: 'GET',
        })
        .reply(200, metadata);
      setGlobalDispatcher(agent);

      await new ProcessTokenJob({ db, job: tokenJob }).work();

      const bundle = await db.getNftMetadataBundle({
        contractPrincipal: 'ABCD.test-nft',
        tokenNumber: 1,
      });
      expect(bundle).not.toBeUndefined();
      expect(bundle?.token.uri).toBe('http://m.io/1.json');
      expect(bundle?.metadataLocale?.metadata.name).toBe('Mutant Monkeys #1');
      expect(bundle?.metadataLocale?.metadata.image).toBe(
        'https://byzantion.mypinata.cloud/ipfs/QmWAYP9LJD15mgrnapfpJhBArG6T3J4XKTM77tzqggvP7w'
      );
      expect(bundle?.metadataLocale?.metadata.description).toBeNull();

      const attr0 = bundle?.metadataLocale?.attributes[0];
      expect(attr0?.trait_type).toBe('Background');
      expect(JSON.parse(attr0?.value as string)).toBe('MM1 Purple');
      expect(attr0?.display_type).toBeNull();

      const attr1 = bundle?.metadataLocale?.attributes[1];
      expect(attr1?.trait_type).toBe('Fur');
      expect(JSON.parse(attr1?.value as string)).toBe(5050);
      expect(attr1?.display_type).toBe('Number');

      const attr2 = bundle?.metadataLocale?.attributes[2];
      expect(attr2?.trait_type).toBe('Clothes');
      expect(JSON.parse(attr2?.value as string)).toStrictEqual(['hello', 'world']);
      expect(attr2?.display_type).toBeNull();

      const properties = bundle?.metadataLocale?.properties as DbMetadataProperty[];
      expect(properties[0].name).toBe('external_url');
      expect(JSON.parse(properties[0].value)).toBe('https://bitcoinmonkeys.io/');
      expect(properties[4].name).toBe('collection_size');
      expect(JSON.parse(properties[4].value)).toBe(5000);
      expect(properties[6].name).toBe('prop');
      expect(JSON.parse(properties[6].value)).toStrictEqual({ a: 1, b: 2 });
    });

    test('parses metadata with localizations', async () => {
      const metadata = {
        name: 'Mutant Monkeys #1',
        image:
          'https://byzantion.mypinata.cloud/ipfs/QmWAYP9LJD15mgrnapfpJhBArG6T3J4XKTM77tzqggvP7w',
        attributes: [
          {
            trait_type: 'Background',
            value: 'MM1 Purple',
          },
          {
            trait_type: 'Fur',
            value: 5050,
            display_type: 'Number',
          },
          {
            trait_type: 'Clothes',
            value: ['hello', 'world'],
          },
        ],
        properties: {
          external_url: 'https://bitcoinmonkeys.io/',
          description:
            "Mutant Monkeys is a collection of 5,000 NFT's that were created by transforming a Bitcoin Monkeys Labs vial of Serum into a Mutant Monkey.",
          colection_name: 'Mutant Monkeys',
          artist: 'Bitcoin Monkeys',
        },
        localization: {
          uri: 'http://m-locale.io/{id}-{locale}.json',
          default: 'en',
          locales: ['en', 'es-MX'],
        },
      };
      const metadataSpanish = {
        name: 'Changos Mutantes #1',
        attributes: [
          {
            trait_type: 'Fondo',
            value: 'MM1 Morado',
          },
        ],
        properties: {
          description: "Changos Mutantes es una colección de 5,000 NFT's",
          colection_name: 'Changos Mutantes',
        },
      };
      const agent = new MockAgent();
      agent.disableNetConnect();
      agent
        .get(`http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`)
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-nft/get-token-uri',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(stringUtf8CV('http://m.io/{id}.json')),
        });
      agent
        .get(`http://m.io`)
        .intercept({
          path: '/1.json',
          method: 'GET',
        })
        .reply(200, metadata);
      agent
        .get(`http://m-locale.io`)
        .intercept({
          path: '/1-es-MX.json',
          method: 'GET',
        })
        .reply(200, metadataSpanish);
      setGlobalDispatcher(agent);

      await new ProcessTokenJob({ db, job: tokenJob }).work();

      const bundle = await db.getNftMetadataBundle({
        contractPrincipal: 'ABCD.test-nft',
        tokenNumber: 1,
      });
      expect(bundle).not.toBeUndefined();
      expect(bundle?.token.uri).toBe('http://m.io/1.json');
      expect(bundle?.metadataLocale?.metadata.l10n_locale).toBe('en');
      expect(bundle?.metadataLocale?.metadata.l10n_default).toBe(true);
      expect(bundle?.metadataLocale?.metadata.l10n_uri).toBe('http://m.io/1.json');

      // Make sure localization overrides work correctly
      const mexicanBundle = await db.getNftMetadataBundle({
        contractPrincipal: 'ABCD.test-nft',
        tokenNumber: 1,
        locale: 'es-MX',
      });
      expect(mexicanBundle).not.toBeUndefined();
      expect(mexicanBundle?.token.uri).toBe('http://m.io/1.json');
      expect(mexicanBundle?.metadataLocale?.metadata.l10n_locale).toBe('es-MX');
      expect(mexicanBundle?.metadataLocale?.metadata.l10n_default).toBe(false);
      expect(mexicanBundle?.metadataLocale?.metadata.l10n_uri).toBe(
        'http://m-locale.io/1-es-MX.json'
      );
      expect(mexicanBundle?.metadataLocale?.metadata.name).toBe('Changos Mutantes #1');
      expect(mexicanBundle?.metadataLocale?.metadata.image).toBe(
        'https://byzantion.mypinata.cloud/ipfs/QmWAYP9LJD15mgrnapfpJhBArG6T3J4XKTM77tzqggvP7w'
      );
      expect(mexicanBundle?.metadataLocale?.metadata.description).toBeNull();
      const attributes = mexicanBundle?.metadataLocale?.attributes as DbMetadataAttribute[];
      expect(attributes.length).toBe(1);
      expect(attributes[0].trait_type).toBe('Fondo');
      expect(JSON.parse(attributes[0].value)).toBe('MM1 Morado');
      const properties = mexicanBundle?.metadataLocale?.properties as DbMetadataProperty[];
      expect(properties[0].name).toBe('external_url');
      expect(JSON.parse(properties[0].value)).toBe('https://bitcoinmonkeys.io/');
      expect(properties[1].name).toBe('description');
      expect(JSON.parse(properties[1].value)).toBe(
        "Changos Mutantes es una colección de 5,000 NFT's"
      );
      expect(properties[2].name).toBe('colection_name');
      expect(JSON.parse(properties[2].value)).toBe('Changos Mutantes');
      expect(properties[3].name).toBe('artist');
      expect(JSON.parse(properties[3].value)).toBe('Bitcoin Monkeys');
    });

    test('metadata refresh replaces previous metadata entries for token', async () => {
      const metadata1 = {
        name: 'Mutant Monkeys #1',
        image:
          'https://byzantion.mypinata.cloud/ipfs/QmWAYP9LJD15mgrnapfpJhBArG6T3J4XKTM77tzqggvP7w',
        attributes: [
          {
            trait_type: 'Background',
            value: 'MM1 Purple',
          },
        ],
        properties: {
          external_url: 'https://bitcoinmonkeys.io/',
          colection_name: 'Mutant Monkeys',
        },
      };
      const metadata2 = {
        name: 'Mutant Monkeys #1 NEW',
        image: 'https://byzantion.mypinata.cloud/ipfs/new',
        attributes: [
          {
            trait_type: 'New Background',
            value: 'MM1 Red',
          },
        ],
        properties: {
          colection_name: 'Mutant Monkeys Reloaded',
        },
      };
      const agent = new MockAgent();
      agent.disableNetConnect();
      agent
        .get(`http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`)
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-nft/get-token-uri',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(stringUtf8CV('http://m.io/{id}.json')),
        });
      agent
        .get(`http://m.io`)
        .intercept({
          path: '/1.json',
          method: 'GET',
        })
        .reply(200, metadata1);
      setGlobalDispatcher(agent);

      // Process once
      await new ProcessTokenJob({ db, job: tokenJob }).work();

      const bundle1 = await db.getNftMetadataBundle({
        contractPrincipal: 'ABCD.test-nft',
        tokenNumber: 1,
      });
      expect(bundle1).not.toBeUndefined();
      expect(bundle1?.token.uri).toBe('http://m.io/1.json');
      expect(bundle1?.metadataLocale?.metadata.name).toBe('Mutant Monkeys #1');
      expect(bundle1?.metadataLocale?.metadata.image).toBe(
        'https://byzantion.mypinata.cloud/ipfs/QmWAYP9LJD15mgrnapfpJhBArG6T3J4XKTM77tzqggvP7w'
      );
      expect(bundle1?.metadataLocale?.attributes.length).toBe(1);
      expect(bundle1?.metadataLocale?.attributes[0].trait_type).toBe('Background');
      expect(JSON.parse(bundle1?.metadataLocale?.attributes[0].value as string)).toBe('MM1 Purple');
      expect(bundle1?.metadataLocale?.properties.length).toBe(2);
      expect(bundle1?.metadataLocale?.properties[0].name).toBe('external_url');
      expect(JSON.parse(bundle1?.metadataLocale?.properties[0].value as string)).toBe(
        'https://bitcoinmonkeys.io/'
      );
      expect(bundle1?.metadataLocale?.properties[1].name).toBe('colection_name');
      expect(JSON.parse(bundle1?.metadataLocale?.properties[1].value as string)).toBe(
        'Mutant Monkeys'
      );

      // Process again with different metadata
      agent
        .get(`http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`)
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-nft/get-token-uri',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(stringUtf8CV('http://m.io/{id}.json')),
        });
      agent
        .get(`http://m.io`)
        .intercept({
          path: '/1.json',
          method: 'GET',
        })
        .reply(200, metadata2);
      await db.updateJobStatus({ id: tokenJob.id, status: DbJobStatus.pending });
      await new ProcessTokenJob({ db, job: tokenJob }).work();

      const bundle2 = await db.getNftMetadataBundle({
        contractPrincipal: 'ABCD.test-nft',
        tokenNumber: 1,
      });
      expect(bundle2).not.toBeUndefined();
      expect(bundle2?.token.uri).toBe('http://m.io/1.json');
      expect(bundle2?.metadataLocale?.metadata.name).toBe('Mutant Monkeys #1 NEW');
      expect(bundle2?.metadataLocale?.metadata.image).toBe(
        'https://byzantion.mypinata.cloud/ipfs/new'
      );
      expect(bundle2?.metadataLocale?.attributes.length).toBe(1);
      expect(bundle2?.metadataLocale?.attributes[0].trait_type).toBe('New Background');
      expect(JSON.parse(bundle2?.metadataLocale?.attributes[0].value as string)).toBe('MM1 Red');
      expect(bundle2?.metadataLocale?.properties.length).toBe(1);
      expect(bundle2?.metadataLocale?.properties[0].name).toBe('colection_name');
      expect(JSON.parse(bundle2?.metadataLocale?.properties[0].value as string)).toBe(
        'Mutant Monkeys Reloaded'
      );
    });

    test('SIP-016 non-compliant metadata is ignored', async () => {
      const metadata = {
        id: '62624cc0065e986192fb9f33',
        media: 'https://sf-stage-s3.s3.us-west-1.amazonaws.com/riyasen_suit.png',
        title: 'Inner Circle',
        primaryPrice: 'USD 25',
        ownerSuperfandomId: '618273560f040f78926d75d4',
        auctionDate: '2022-04-22T06:30:00.000Z',
        totalEditions: 100,
        currentEdition: 67,
        editionNft: true,
      };
      const agent = new MockAgent();
      agent.disableNetConnect();
      agent
        .get(`http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`)
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-nft/get-token-uri',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(stringUtf8CV('http://m.io/{id}.json')),
        });
      agent
        .get(`http://m.io`)
        .intercept({
          path: '/1.json',
          method: 'GET',
        })
        .reply(200, metadata);
      setGlobalDispatcher(agent);

      await new ProcessTokenJob({ db, job: tokenJob }).work();

      const bundle = await db.getNftMetadataBundle({
        contractPrincipal: 'ABCD.test-nft',
        tokenNumber: 1,
      });
      expect(bundle?.metadataLocale).toBeUndefined();
    });
  });
});
