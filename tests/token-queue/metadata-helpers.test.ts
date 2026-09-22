import { strict as assert } from 'node:assert';
import { ENV } from '../../src/env.js';
import {
  MetadataHttpError,
  MetadataParseError,
  MetadataSizeExceededError,
  MetadataTimeoutError,
} from '../../src/token-processor/util/errors.js';
import {
  getFetchableMetadataUrl,
  getMetadataFromUri,
  getTokenSpecificUri,
  fetchMetadata,
} from '../../src/token-processor/util/metadata-helpers.js';
import { startTestHttpServer, TestHttpServer } from '../helpers.js';
import { afterEach, beforeEach, describe, test } from 'node:test';

describe('Metadata Helpers', () => {
  let server: TestHttpServer;

  beforeEach(async () => {
    server = await startTestHttpServer();
  });

  afterEach(async () => {
    await server.close();
  });
  test('performs timed and limited request', async () => {
    const url = new URL(server.urlFor('/1.json'));

    server.serve('/1.json', { body: 'hello' });

    const result = await fetchMetadata(url, 'ABCD.test', 1n);
    assert.strictEqual(result, 'hello');
  });

  test('throws on incorrect raw metadata schema', async () => {
    server.serve('/1.json', { body: '[{"test-bad-json": true}]' });

    await assert.rejects(
      getMetadataFromUri(server.urlFor('/1.json'), 'ABCD.test', 1n),
      MetadataParseError
    );
  });

  test('throws metadata http errors', async () => {
    const url = new URL(server.urlFor('/1.json'));
    server.serve('/1.json', { status: 500, body: { message: 'server error' } });

    await assert.rejects(fetchMetadata(url, 'ABCD.test', 1n), MetadataHttpError);
  });

  test('does not throw on raw metadata with null, stringable, or boolean values', async () => {
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
        allow_multiple_claims: true,
        whitelisted: false,
        minted: 160,
      },
      localization: {
        uri: null,
        locales: ['en'],
        default: 'en',
      },
    };
    server.serve('/1.json', { body: crashPunks1 });

    await assert.doesNotReject(getMetadataFromUri(server.urlFor('/1.json'), 'ABCD.test', 1n));
  });

  test('throws when metadata does not contain a name', async () => {
    const crashPunks1 = {
      sip: 16,
      image: 'ipfs://Qmb84UcaMr1MUwNbYBnXWHM3kEaDcYrKuPWwyRLVTNKELC/294.png',
    };
    server.serve('/1.json', { body: crashPunks1 });

    await assert.rejects(
      getMetadataFromUri(server.urlFor('/1.json'), 'ABCD.test', 1n),
      MetadataParseError
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
    server.serve('/1.json', { body: json });

    const metadata = await getMetadataFromUri(server.urlFor('/1.json'), 'ABCD.test', 1n);
    assert.strictEqual(metadata.name, 'Mutant Monkeys #27');
    assert.strictEqual(
      metadata.image,
      'https://byzantion.mypinata.cloud/ipfs/QmbNC9qvcYZugaeGeReDhyYiNH7oPzrCX1cZUnQeszFz4P'
    );
    const attributes = metadata.attributes;
    assert.notStrictEqual(attributes, undefined);
    if (attributes) {
      assert.strictEqual(attributes[0].trait_type, 'Background');
      assert.strictEqual(attributes[0].value, 'MM1 Orange');
    }
  });

  test('parses valid JSON5 strings', async () => {
    const json =
      '{\n  "name": "Boombox [4th Edition]",\n  "description": "The first ever Boombox to exist IRL, this art was created by 3D printing a model and photographing it under some very Boomerific lighting. 💥",\n  "creator": "Official Boomboxes",\n  "image": "https://cloudflare-ipfs.com/ipfs/bafybeiggfn5e4k3lu23ibs3mgpfonsscr4nadwwkyflqk7xo5kepmfnwhu",  \n  "properties": {\n    "external_url": {\n      "display_type": "url",\n      "trait_type": "string",\n      "value": "https://app.sigle.io/boom.id.blockstack/tOja1EkEDtKlR5-CH9ogG"\n    },\n    "twitter_url": {\n      "display_type": "url",\n      "trait_type": "string",\n      "value": "https://twitter.com/boom_wallet"\n    },\n    "discord_url": {\n      "display_type": "url",\n      "trait_type": "string",\n      "value": "https://discord.gg/4PhujhCGzB"\n    },\n  },\n}\n';
    server.serve('/1.json', { body: json });

    const metadata = await getMetadataFromUri(server.urlFor('/1.json'), 'ABCD.test', 1n);
    assert.strictEqual(metadata.name, 'Boombox [4th Edition]');
    assert.strictEqual(
      metadata.description,
      'The first ever Boombox to exist IRL, this art was created by 3D printing a model and photographing it under some very Boomerific lighting. 💥'
    );
    assert.strictEqual(
      metadata.image,
      'https://cloudflare-ipfs.com/ipfs/bafybeiggfn5e4k3lu23ibs3mgpfonsscr4nadwwkyflqk7xo5kepmfnwhu'
    );
    const properties = metadata.properties;
    assert.notStrictEqual(properties, undefined);
    if (properties) {
      assert.strictEqual(properties['external_url'].display_type, 'url');
      assert.strictEqual(properties['external_url'].trait_type, 'string');
      assert.strictEqual(
        properties['external_url'].value,
        'https://app.sigle.io/boom.id.blockstack/tOja1EkEDtKlR5-CH9ogG'
      );
      assert.strictEqual(properties['twitter_url'].display_type, 'url');
      assert.strictEqual(properties['twitter_url'].trait_type, 'string');
      assert.strictEqual(properties['twitter_url'].value, 'https://twitter.com/boom_wallet');
      assert.strictEqual(properties['discord_url'].display_type, 'url');
      assert.strictEqual(properties['discord_url'].trait_type, 'string');
      assert.strictEqual(properties['discord_url'].value, 'https://discord.gg/4PhujhCGzB');
    }
  });

  test('get fetchable URLs', () => {
    ENV.PUBLIC_GATEWAY_IPFS = 'https://cloudflare-ipfs.com';
    ENV.PUBLIC_GATEWAY_ARWEAVE = 'https://arweave.net';
    ENV.PUBLIC_GATEWAY_IPFS_EXTRA_HEADER = 'Authorization: Bearer 1234567890';

    const arweave = 'ar://II4z2ziYyqG7-kWDa98lWGfjxRdYOx9Zdld9P_I_kzE/9731.json';
    const fetch1 = getFetchableMetadataUrl(arweave);
    assert.strictEqual(
      fetch1.url.toString(),
      'https://arweave.net/II4z2ziYyqG7-kWDa98lWGfjxRdYOx9Zdld9P_I_kzE/9731.json'
    );
    assert.strictEqual(fetch1.gateway, 'arweave');
    assert.strictEqual(fetch1.fetchHeaders, undefined);

    const ipfs =
      'ipfs://ipfs/bafybeifwoqwdhs5djtx6vopvuwfcdrqeuecayp5wzpzjylxycejnhtrhgu/vague_art_paintings/vague_art_paintings_6_metadata.json';
    const fetch2 = getFetchableMetadataUrl(ipfs);
    assert.strictEqual(
      fetch2.url.toString(),
      'https://cloudflare-ipfs.com/ipfs/bafybeifwoqwdhs5djtx6vopvuwfcdrqeuecayp5wzpzjylxycejnhtrhgu/vague_art_paintings/vague_art_paintings_6_metadata.json'
    );
    assert.strictEqual(fetch2.gateway, 'ipfs');
    assert.deepStrictEqual(fetch2.fetchHeaders, { Authorization: 'Bearer 1234567890' });

    const ipfs2 = 'ipfs://QmYCnfeseno5cLpC75rmy6LQhsNYQCJabiuwqNUXMaA3Fo/1145.png';
    const fetch3 = getFetchableMetadataUrl(ipfs2);
    assert.strictEqual(
      fetch3.url.toString(),
      'https://cloudflare-ipfs.com/ipfs/QmYCnfeseno5cLpC75rmy6LQhsNYQCJabiuwqNUXMaA3Fo/1145.png'
    );
    assert.strictEqual(fetch3.gateway, 'ipfs');
    assert.deepStrictEqual(fetch3.fetchHeaders, { Authorization: 'Bearer 1234567890' });

    const ipfs3 = 'https://ipfs.io/ipfs/QmYCnfeseno5cLpC75rmy6LQhsNYQCJabiuwqNUXMaA3Fo/1145.png';
    const fetch4 = getFetchableMetadataUrl(ipfs3);
    assert.strictEqual(
      fetch4.url.toString(),
      'https://cloudflare-ipfs.com/ipfs/QmYCnfeseno5cLpC75rmy6LQhsNYQCJabiuwqNUXMaA3Fo/1145.png'
    );
    assert.strictEqual(fetch4.gateway, 'ipfs');
    assert.deepStrictEqual(fetch4.fetchHeaders, { Authorization: 'Bearer 1234567890' });

    const http = 'https://test.io/1.json';
    const fetch5 = getFetchableMetadataUrl(http);
    assert.strictEqual(fetch5.url.toString(), http);
    assert.strictEqual(fetch5.gateway, null);
    assert.strictEqual(fetch5.fetchHeaders, undefined);
  });

  test('replace URI string tokens', () => {
    const uri1 =
      'https://ipfs.io/ipfs/QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn/$TOKEN_ID.json';
    assert.strictEqual(
      getTokenSpecificUri(uri1, 7n),
      'https://ipfs.io/ipfs/QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn/7.json'
    );
    const uri2 = 'https://ipfs.io/ipfs/QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn/{id}.json';
    assert.strictEqual(
      getTokenSpecificUri(uri2, 7n),
      'https://ipfs.io/ipfs/QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn/7.json'
    );
    const uri3 =
      'https://ipfs.io/ipfs/QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn/{id}-{locale}.json';
    assert.strictEqual(
      getTokenSpecificUri(uri3, 7n, 'es'),
      'https://ipfs.io/ipfs/QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn/7-es.json'
    );
  });

  test('catches ECONNRESET errors', async () => {
    const url = new URL(server.urlFor('/1.json'));
    // A real reset: the server drops the socket instead of answering.
    server.serve('/1.json', { destroySocket: true });

    await assert.rejects(fetchMetadata(url, 'ABCD.test', 1n), MetadataHttpError);
  });
});
