import { MockAgent, setGlobalDispatcher } from 'undici';
import { ENV } from '../src/env';
import {
  HttpError,
  MetadataParseError,
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

  test('throws metadata http errors', async () => {
    const url = new URL('http://test.io/1.json');
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent
      .get('http://test.io')
      .intercept({
        path: '/1.json',
        method: 'GET',
      })
      .reply(500, { message: 'server error' });
    setGlobalDispatcher(agent);

    await expect(performSizeAndTimeLimitedMetadataFetch(url)).rejects.toThrow(HttpError);
  });

  test('does not throw on raw metadata with null or stringable values', async () => {
    const crashPunks1 = {
      version: '1',
      name: 'Crash Punk 294',
      description: null,
      image: 'ipfs://Qmb84UcaMr1MUwNbYBnXWHM3kEaDcYrKuPWwyRLVTNKELC/294.png',
      properties: {
        collection: 'Crash Punks',
        collectionId: 'grace.btc/crash_punks',
        dna: '23dbacae61aa20ed58164e06d07ce67752c3dfd3',
        total_supply: '9216',
        external_url:
          'https://thisisnumberone.com/nfts/SP3QSAJQ4EA8WXEDSRRKMZZ29NH91VZ6C5X88FGZQ.crashpunks-v2/294',
        animation_url: null,
      },
      localization: {
        uri: null,
        locales: ['en'],
        default: 'en',
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
      .reply(200, crashPunks1);
    setGlobalDispatcher(agent);

    await expect(getMetadataFromUri('http://test.io/1.json')).resolves.not.toThrow();
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
      .reply(200, json);
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

  test('parses valid JSON5 strings', async () => {
    const json =
      '{\n  "name": "Boombox [4th Edition]",\n  "description": "The first ever Boombox to exist IRL, this art was created by 3D printing a model and photographing it under some very Boomerific lighting. 💥",\n  "creator": "Official Boomboxes",\n  "image": "https://cloudflare-ipfs.com/ipfs/bafybeiggfn5e4k3lu23ibs3mgpfonsscr4nadwwkyflqk7xo5kepmfnwhu",  \n  "properties": {\n    "external_url": {\n      "display_type": "url",\n      "trait_type": "string",\n      "value": "https://app.sigle.io/boom.id.blockstack/tOja1EkEDtKlR5-CH9ogG"\n    },\n    "twitter_url": {\n      "display_type": "url",\n      "trait_type": "string",\n      "value": "https://twitter.com/boom_wallet"\n    },\n    "discord_url": {\n      "display_type": "url",\n      "trait_type": "string",\n      "value": "https://discord.gg/4PhujhCGzB"\n    },\n  },\n}\n';
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent
      .get('http://test.io')
      .intercept({
        path: '/1.json',
        method: 'GET',
      })
      .reply(200, json);
    setGlobalDispatcher(agent);

    const metadata = await getMetadataFromUri('http://test.io/1.json');
    expect(metadata.name).toBe('Boombox [4th Edition]');
    expect(metadata.description).toBe(
      'The first ever Boombox to exist IRL, this art was created by 3D printing a model and photographing it under some very Boomerific lighting. 💥'
    );
    expect(metadata.image).toBe(
      'https://cloudflare-ipfs.com/ipfs/bafybeiggfn5e4k3lu23ibs3mgpfonsscr4nadwwkyflqk7xo5kepmfnwhu'
    );
    const properties = metadata.properties;
    expect(properties).not.toBeUndefined();
    if (properties) {
      expect(properties['external_url'].display_type).toBe('url');
      expect(properties['external_url'].trait_type).toBe('string');
      expect(properties['external_url'].value).toBe(
        'https://app.sigle.io/boom.id.blockstack/tOja1EkEDtKlR5-CH9ogG'
      );
      expect(properties['twitter_url'].display_type).toBe('url');
      expect(properties['twitter_url'].trait_type).toBe('string');
      expect(properties['twitter_url'].value).toBe('https://twitter.com/boom_wallet');
      expect(properties['discord_url'].display_type).toBe('url');
      expect(properties['discord_url'].trait_type).toBe('string');
      expect(properties['discord_url'].value).toBe('https://discord.gg/4PhujhCGzB');
    }
  });

  test('get fetchable URLs', () => {
    ENV.PUBLIC_GATEWAY_IPFS = 'https://cloudflare-ipfs.com';
    ENV.PUBLIC_GATEWAY_ARWEAVE = 'https://arweave.net';
    const arweave = 'ar://II4z2ziYyqG7-kWDa98lWGfjxRdYOx9Zdld9P_I_kzE/9731.json';
    expect(getFetchableUrl(arweave).toString()).toBe(
      'https://arweave.net/II4z2ziYyqG7-kWDa98lWGfjxRdYOx9Zdld9P_I_kzE/9731.json'
    );
    const ipfs =
      'ipfs://ipfs/bafybeifwoqwdhs5djtx6vopvuwfcdrqeuecayp5wzpzjylxycejnhtrhgu/vague_art_paintings/vague_art_paintings_6_metadata.json';
    expect(getFetchableUrl(ipfs).toString()).toBe(
      'https://cloudflare-ipfs.com/ipfs/bafybeifwoqwdhs5djtx6vopvuwfcdrqeuecayp5wzpzjylxycejnhtrhgu/vague_art_paintings/vague_art_paintings_6_metadata.json'
    );
    const ipfs2 = 'ipfs://QmYCnfeseno5cLpC75rmy6LQhsNYQCJabiuwqNUXMaA3Fo/1145.png';
    expect(getFetchableUrl(ipfs2).toString()).toBe(
      'https://cloudflare-ipfs.com/ipfs/QmYCnfeseno5cLpC75rmy6LQhsNYQCJabiuwqNUXMaA3Fo/1145.png'
    );
  });

  test('replace URI string tokens', () => {
    const uri1 =
      'https://ipfs.io/ipfs/QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn/$TOKEN_ID.json';
    expect(getTokenSpecificUri(uri1, 7n)).toBe(
      'https://ipfs.io/ipfs/QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn/7.json'
    );
    const uri2 = 'https://ipfs.io/ipfs/QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn/{id}.json';
    expect(getTokenSpecificUri(uri2, 7n)).toBe(
      'https://ipfs.io/ipfs/QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn/7.json'
    );
    const uri3 =
      'https://ipfs.io/ipfs/QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn/{id}-{locale}.json';
    expect(getTokenSpecificUri(uri3, 7n, 'es')).toBe(
      'https://ipfs.io/ipfs/QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn/7-es.json'
    );
  });
});
