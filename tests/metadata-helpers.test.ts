import { MockAgent, setGlobalDispatcher } from 'undici';
import { ENV } from '../src/env';
import { DbToken, DbTokenType } from '../src/pg/types';
import {
  fetchAllMetadataLocalesFromBaseUri,
  getMetadataFromUri,
  performSizeAndTimeLimitedMetadataFetch,
} from '../src/token-processor/util/metadata-helpers';

describe('Metadata Helpers', () => {
  test('performs timed and limited request', async () => {
    const url = new URL('http://test.io/1.json');

    const agent = new MockAgent();
    agent.disableNetConnect();
    agent
      .get('http://test.io')
      .intercept({
        path: '/1.json',
        method: 'GET',
      })
      .reply(200, 'hello');
    setGlobalDispatcher(agent);

    const result = await performSizeAndTimeLimitedMetadataFetch(url);
    expect(result).toBe('hello');
  });

  test('reject large responses', async () => {
    const yugeBuffer = Buffer.alloc(ENV.METADATA_MAX_PAYLOAD_BYTE_SIZE + 100);
    const url = new URL('http://test.io/1.json');

    const agent = new MockAgent();
    agent.disableNetConnect();
    agent
      .get('http://test.io')
      .intercept({
        path: '/1.json',
        method: 'GET',
      })
      .reply(200, yugeBuffer);
    setGlobalDispatcher(agent);

    await expect(performSizeAndTimeLimitedMetadataFetch(url)).rejects.toThrow(
      /Fetch size limit exceeded/
    );
  });

  test('reject timed out requests', async () => {
    const prevTimeout = ENV.METADATA_FETCH_TIMEOUT_MS;
    ENV.METADATA_FETCH_TIMEOUT_MS = 100;
    const url = new URL('http://test.io/1.json');

    const agent = new MockAgent();
    agent.disableNetConnect();
    agent
      .get('http://test.io')
      .intercept({
        path: '/1.json',
        method: 'GET',
      })
      .reply(200, '')
      .delay(150);
    setGlobalDispatcher(agent);

    await expect(performSizeAndTimeLimitedMetadataFetch(url)).rejects.toThrow(
      /Time limit exceeded/
    );
    ENV.METADATA_FETCH_TIMEOUT_MS = prevTimeout;
  });

  test('throws on incorrect raw metadata schema', async () => {
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent
      .get('http://test.io')
      .intercept({
        path: '/1.json',
        method: 'GET',
      })
      .reply(200, '[{"test-bad-json": true}]');
    setGlobalDispatcher(agent);

    await expect(getMetadataFromUri('http://test.io/1.json')).rejects.toThrow(
      /Invalid raw metadata JSON schema/
    );
  });

  test('fetches typed raw metadata', async () => {
    const json = {
      version: 1,
      name: 'Mutant Monkeys #27',
      image: 'https://byzantion.mypinata.cloud/ipfs/QmbNC9qvcYZugaeGeReDhyYiNH7oPzrCX1cZUnQeszFz4P',
      attributes: [
        {
          trait_type: 'Background',
          value: 'MM1 Orange',
        },
      ],
      properties: {
        external_url: 'https://bitcoinmonkeys.io/',
        description:
          'Mutant Monkeys is a collection of 5,000 NFT’s that were created by transforming a Bitcoin Monkeys Labs vial of Serum into a Mutant Monkey.',
        colection_name: 'Mutant Monkeys',
        collection_image:
          'https://byzantion.mypinata.cloud/ipfs/QmcsJmDdzutRYWg8e6E4Vqrs2Yon79BHfb14U3WnitwZSQ',
        collection_size: 5000,
        artist: 'Bitcoin Monkeys',
      },
    };
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent
      .get('http://test.io')
      .intercept({
        path: '/1.json',
        method: 'GET',
      })
      .reply(200, JSON.stringify(json));
    setGlobalDispatcher(agent);

    const metadata = await getMetadataFromUri('http://test.io/1.json');
    expect(metadata.name).toBe('Mutant Monkeys #27');
    expect(metadata.image).toBe(
      'https://byzantion.mypinata.cloud/ipfs/QmbNC9qvcYZugaeGeReDhyYiNH7oPzrCX1cZUnQeszFz4P'
    );
    const attributes = metadata.attributes;
    expect(attributes).not.toBeUndefined();
    if (attributes) {
      expect(attributes[0].trait_type).toBe('Background');
      expect(attributes[0].value).toBe('MM1 Orange');
    }
  });

  // test('fetches all metadata locales', async () => {
  //   const token: DbToken = {
  //     id: 1,
  //     smart_contract_id: 1,
  //     type: DbTokenType.nft,
  //     token_number: 1,
  //     created_at: '2022-01-01',
  //   };

  //   const agent = new MockAgent();
  //   agent.disableNetConnect();
  //   agent
  //     .get('http://test.io')
  //     .intercept({
  //       path: '/1.json',
  //       method: 'GET',
  //     })
  //     .reply(200, '[{"test-bad-json": true}]');
  //   setGlobalDispatcher(agent);

  //   await expect(
  //     fetchAllMetadataLocalesFromBaseUri('http://test.io/{id}.json', token)
  //   ).rejects.toThrow(/Invalid raw metadata JSON schema/);
  // });
});
