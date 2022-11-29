import { MockAgent, setGlobalDispatcher } from 'undici';
import { ENV } from '../src/env';
import {
  MetadataSizeExceededError,
  MetadataTimeoutError,
} from '../src/token-processor/util/errors';
import {
  getFetchableUrl,
  getMetadataFromUri,
  getTokenSpecificUri,
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
      MetadataSizeExceededError
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

    await expect(performSizeAndTimeLimitedMetadataFetch(url)).rejects.toThrow(MetadataTimeoutError);
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

  test('get fetchable URLs', () => {
    const arweave = 'ar://II4z2ziYyqG7-kWDa98lWGfjxRdYOx9Zdld9P_I_kzE/9731.json';
    expect(getFetchableUrl(arweave).toString()).toBe(
      'https://arweave.net/II4z2ziYyqG7-kWDa98lWGfjxRdYOx9Zdld9P_I_kzE/9731.json'
    );
    const ipfs = 'ipfs://ipfs/QmPAg1mjxcEQPPtqsLoEcauVedaeMH81WXDPvPx3VC5zUz';
    expect(getFetchableUrl(ipfs).toString()).toBe(
      'https://ipfs.io/ipfs/QmPAg1mjxcEQPPtqsLoEcauVedaeMH81WXDPvPx3VC5zUz'
    );
  });

  test('replace URI string tokens', () => {
    const uri1 =
      'https://ipfs.io/ipfs/QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn/$TOKEN_ID.json';
    expect(getTokenSpecificUri(uri1, 7)).toBe(
      'https://ipfs.io/ipfs/QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn/7.json'
    );
    const uri2 = 'https://ipfs.io/ipfs/QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn/{id}.json';
    expect(getTokenSpecificUri(uri2, 7)).toBe(
      'https://ipfs.io/ipfs/QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn/7.json'
    );
    const uri3 =
      'https://ipfs.io/ipfs/QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn/{id}-{locale}.json';
    expect(getTokenSpecificUri(uri3, 7, 'es')).toBe(
      'https://ipfs.io/ipfs/QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn/7-es.json'
    );
  });
});
