import { strict as assert } from 'node:assert';
import { after, before, describe, mock, test } from 'node:test';
import dns from 'node:dns';
import { Agent, request } from 'undici';
import { ENV } from '../../src/env.js';
import { processImageCache } from '../../src/token-processor/images/image-cache.js';
import {
  BlockedFetchDestinationError,
  getUserErrorInvalidReason,
} from '../../src/token-processor/util/errors.js';
import {
  assertResolvedAddressesAllowed,
  createFetchDestinationConnector,
  isBlockedIpAddress,
  setLoopbackAllowedForTesting,
} from '../../src/token-processor/util/fetch-destination-policy.js';
import {
  fetchAllMetadataLocalesFromBaseUri,
  fetchMetadata,
} from '../../src/token-processor/util/metadata-helpers.js';
import {
  DbJobInvalidReason,
  DbSipNumber,
  DbSmartContract,
  DbToken,
  DbTokenType,
} from '../../src/pg/types.js';
import { startTestHttpServer, TestHttpResponse } from '../helpers.js';

/** An address in a blocked range that is never routable, used as a redirect target. */
const CLOUD_METADATA_URL = 'http://169.254.169.254/latest/meta-data/';

const startCountingServer = (response: TestHttpResponse) => startTestHttpServer({ '/': response });

describe('Fetch destination policy', () => {
  describe('address classification', () => {
    // Loopback is exempt by default under `NODE_ENV=test`, so turn the exemption off to assert the
    // policy the worker actually runs with in production.
    let previousLoopbackAllowed: boolean;
    before(() => {
      previousLoopbackAllowed = setLoopbackAllowedForTesting(false);
    });
    after(() => {
      setLoopbackAllowedForTesting(previousLoopbackAllowed);
    });

    const blocked = [
      ['loopback', '127.0.0.1'],
      ['loopback, non-canonical', '127.1.2.3'],
      ['IPv6 loopback', '::1'],
      ['unspecified', '0.0.0.0'],
      ['IPv6 unspecified', '::'],
      ['private 10/8', '10.0.0.1'],
      ['private 172.16/12', '172.20.30.40'],
      ['private 192.168/16', '192.168.1.1'],
      ['carrier-grade NAT', '100.64.0.1'],
      ['link-local', '169.254.1.1'],
      ['cloud metadata', '169.254.169.254'],
      ['IPv4-mapped IPv6 loopback', '::ffff:127.0.0.1'],
      ['IPv4-mapped IPv6 cloud metadata', '::ffff:169.254.169.254'],
      ['IPv6 unique local', 'fc00::1'],
      ['IPv6 cloud metadata', 'fd00:ec2::254'],
      ['IPv6 link-local', 'fe80::1'],
      ['IPv6 link-local, top of range', 'febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff'],
      ['IPv6 site-local', 'fec0::1'],
      ['IPv6 site-local, top of range', 'feff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'],
      ['IPv6 multicast', 'ff02::1'],
      ['NAT64', '64:ff9b::7f00:1'],
      ['Teredo', '2001:0:1234::1'],
      ['IPv6 benchmarking', '2001:2::1'],
      ['IPv6 ORCHIDv2', '2001:20::1'],
      ['IPv6 documentation (RFC 9637)', '3fff::1'],
      ['IPv6 AS112 direct delegation', '2620:4f:8000::1'],
      ['IPv6 unallocated space above global unicast', '4000::1'],
      ['IPv6 unallocated space below global unicast', '1fff:ffff::1'],
      ['IPv6 unallocated space, adjacent to link-local', 'fe7f:ffff::1'],
      ['6to4', '2002:7f00:1::1'],
      ['multicast', '224.0.0.1'],
      ['broadcast', '255.255.255.255'],
      ['not an IP address', 'metadata.google.internal'],
    ] as const;
    for (const [name, address] of blocked) {
      test(`blocks ${name} (${address})`, () => {
        assert.equal(isBlockedIpAddress(address), true);
      });
    }

    const allowed = [
      ['public IPv4', '8.8.8.8'],
      ['public IPv4, adjacent to a blocked range', '169.253.255.255'],
      ['public IPv6', '2606:4700:4700::1111'],
      ['IPv4-mapped public IPv6', '::ffff:8.8.8.8'],
      ['public IPv6, bottom of global unicast', '2000::1'],
      ['public IPv6, above the documentation range', '3ffe:ffff::1'],
    ] as const;
    for (const [name, address] of allowed) {
      test(`allows ${name} (${address})`, () => {
        assert.equal(isBlockedIpAddress(address), false);
      });
    }

    test('allows loopback only while the test exemption is on', () => {
      assert.equal(isBlockedIpAddress('127.0.0.1'), true);
      const previous = setLoopbackAllowedForTesting(true);
      try {
        assert.equal(isBlockedIpAddress('127.0.0.1'), false);
        assert.equal(isBlockedIpAddress('::1'), false);
        // The exemption covers loopback only, not the rest of the blocked space.
        assert.equal(isBlockedIpAddress('169.254.169.254'), true);
        assert.equal(isBlockedIpAddress('10.0.0.1'), true);
      } finally {
        setLoopbackAllowedForTesting(previous);
      }
    });
  });

  describe('resolved address validation', () => {
    let previousLoopbackAllowed: boolean;
    before(() => {
      previousLoopbackAllowed = setLoopbackAllowedForTesting(false);
    });
    after(() => {
      setLoopbackAllowedForTesting(previousLoopbackAllowed);
    });

    test('accepts a hostname that resolves only to public addresses', () => {
      assert.doesNotThrow(() =>
        assertResolvedAddressesAllowed('cdn.example.com', [
          { address: '8.8.8.8', family: 4 },
          { address: '2606:4700:4700::1111', family: 6 },
        ])
      );
    });

    test('rejects a hostname resolving to a mix of public and private addresses', () => {
      assert.throws(
        () =>
          assertResolvedAddressesAllowed('rebind.example.com', [
            { address: '8.8.8.8', family: 4 },
            { address: '10.0.0.1', family: 4 },
          ]),
        BlockedFetchDestinationError
      );
    });

    test('rejects integer and hex encoded IPs once the resolver decodes them', () => {
      // `2130706433` and `0x7f.0.0.1` are not IP literals as far as `net.isIP` is concerned, so
      // they reach the resolver as hostnames. Validating what comes back is what catches them.
      assert.throws(
        () => assertResolvedAddressesAllowed('2130706433', [{ address: '127.0.0.1', family: 4 }]),
        BlockedFetchDestinationError
      );
      assert.throws(
        () => assertResolvedAddressesAllowed('0x7f.0.0.1', [{ address: '127.0.0.1', family: 4 }]),
        BlockedFetchDestinationError
      );
    });

    test('rejects a hostname that resolves to nothing', () => {
      assert.throws(
        () => assertResolvedAddressesAllowed('empty.example.com', []),
        BlockedFetchDestinationError
      );
    });
  });

  describe('connector enforcement', () => {
    let previousLoopbackAllowed: boolean;
    before(() => {
      previousLoopbackAllowed = setLoopbackAllowedForTesting(false);
    });
    after(() => {
      setLoopbackAllowedForTesting(previousLoopbackAllowed);
    });

    const agent = new Agent({ connect: createFetchDestinationConnector({}) });

    test('refuses an IPv4 literal before the server is contacted', async () => {
      const server = await startCountingServer({ body: 'secret' });
      try {
        await assert.rejects(request(server.url, { dispatcher: agent }), error => {
          assert.ok(error instanceof Error);
          assert.ok(String(error.cause ?? error).includes('not a permitted public address'));
          return true;
        });
        assert.equal(server.requestCount(), 0, 'server must never receive the request');
      } finally {
        await server.close();
      }
    });

    test('refuses an IPv6 literal', async () => {
      await assert.rejects(request('http://[::1]:1/', { dispatcher: agent }), error => {
        assert.ok(
          String((error as Error).cause ?? error).includes('not a permitted public address')
        );
        return true;
      });
    });

    test('refuses a hostname that resolves to loopback', async () => {
      const server = await startCountingServer({ body: 'secret' });
      const port = new URL(server.url).port;
      try {
        await assert.rejects(request(`http://localhost:${port}/`, { dispatcher: agent }), error => {
          assert.ok(
            String((error as Error).cause ?? error).includes('not a permitted public address')
          );
          return true;
        });
        assert.equal(server.requestCount(), 0, 'server must never receive the request');
      } finally {
        await server.close();
      }
    });
  });

  describe('metadata fetch path', () => {
    // No dispatcher juggling: `fetchMetadata` now always uses the live `METADATA_FETCH_HTTP_AGENT`,
    // so this exercises the connector the worker actually runs with.
    let previousLoopbackAllowed: boolean;
    before(() => {
      previousLoopbackAllowed = setLoopbackAllowedForTesting(false);
    });
    after(() => {
      setLoopbackAllowedForTesting(previousLoopbackAllowed);
    });

    test('rejects a token URI pointing at loopback', async () => {
      const server = await startCountingServer({ body: '{"name":"leak"}' });
      try {
        await assert.rejects(
          fetchMetadata(new URL(server.url), 'ABCD.test', 1n),
          BlockedFetchDestinationError
        );
        assert.equal(server.requestCount(), 0);
      } finally {
        await server.close();
      }
    });

    test('rejects a token URI pointing at the cloud metadata endpoint', async () => {
      await assert.rejects(
        fetchMetadata(new URL(CLOUD_METADATA_URL), 'ABCD.test', 1n),
        BlockedFetchDestinationError
      );
    });

    test('rejects a redirect into a blocked range', async () => {
      // The metadata path follows redirects through the agent's redirect interceptor, which
      // re-dispatches every hop. The first hop is a permitted host, so reaching the second one at
      // all is what proves the connector runs per hop rather than once against the declared URL.
      const server = await startCountingServer({
        status: 302,
        headers: { location: CLOUD_METADATA_URL },
      });
      // The surrounding suite turns the loopback exemption off; the first hop has to be reachable
      // for the second one to be worth asserting on.
      const previous = setLoopbackAllowedForTesting(true);
      try {
        await assert.rejects(
          fetchMetadata(new URL(server.url), 'ABCD.test', 1n),
          BlockedFetchDestinationError
        );
        assert.equal(server.requestCount(), 1, 'the first hop is allowed, the redirect is not');
      } finally {
        setLoopbackAllowedForTesting(previous);
        await server.close();
      }
    });
  });

  describe('image fetch path', () => {
    before(() => {
      ENV.IMAGE_CACHE_PROCESSOR_ENABLED = true;
      ENV.IMAGE_CACHE_UPLOAD_PROVIDER = 'gcs';
      ENV.IMAGE_CACHE_GCS_BUCKET_NAME = 'test';
      ENV.IMAGE_CACHE_GCS_OBJECT_NAME_PREFIX = 'prefix/';
    });

    test('rejects an image URL pointing at the cloud metadata endpoint', async () => {
      await assert.rejects(
        processImageCache(CLOUD_METADATA_URL, 'ABCD.test', 1n),
        BlockedFetchDestinationError
      );
    });

    test('rejects a redirect into a blocked range', async () => {
      // The image path uses `fetch`, which follows redirects internally. The first hop is a
      // permitted host, so only per-hop enforcement can stop the second one.
      const server = await startCountingServer({
        status: 302,
        headers: { location: CLOUD_METADATA_URL },
      });
      try {
        await assert.rejects(
          processImageCache(server.url, 'ABCD.test', 1n),
          BlockedFetchDestinationError
        );
        assert.equal(server.requestCount(), 1, 'the first hop is allowed, the redirect is not');
      } finally {
        await server.close();
      }
    });
  });

  describe('immediate retry loop', () => {
    const contract = {
      id: 1,
      principal: 'ABCD.test',
      sip: DbSipNumber.sip009,
      block_height: 1,
      index_block_hash: '0x00',
      tx_id: '0x00',
      tx_index: 0,
      created_at: '2026-01-01',
    } as DbSmartContract;
    const token = {
      id: 1,
      smart_contract_id: 1,
      type: DbTokenType.nft,
      token_number: 1n,
      uri: null,
      name: null,
      decimals: null,
      total_supply: null,
      symbol: null,
      created_at: '2026-01-01',
      updated_at: null,
    } as DbToken;

    let previousLoopbackAllowed: boolean;
    before(() => {
      previousLoopbackAllowed = setLoopbackAllowedForTesting(false);
    });
    after(() => {
      setLoopbackAllowedForTesting(previousLoopbackAllowed);
    });

    test('does not immediately retry a blocked destination', async () => {
      assert.ok(
        ENV.METADATA_MAX_IMMEDIATE_URI_RETRIES > 1,
        'this test is only meaningful when immediate retries are enabled'
      );
      // The fetch runs on the live agent, so attempts are counted where the policy actually runs:
      // `localhost` costs exactly one hostname resolution per attempt before it is refused.
      let lookups = 0;
      const lookup = dns.lookup;
      mock.method(dns, 'lookup', (...args: unknown[]) => {
        lookups++;
        return (lookup as (...a: unknown[]) => unknown)(...args);
      });
      try {
        await assert.rejects(
          fetchAllMetadataLocalesFromBaseUri('http://localhost/1.json', contract, token),
          BlockedFetchDestinationError
        );
      } finally {
        mock.restoreAll();
      }
      // A blocked destination is terminal, so the loop must give up after the first attempt rather
      // than burning all `METADATA_MAX_IMMEDIATE_URI_RETRIES` on a fetch that can never succeed.
      assert.equal(lookups, 1);
    });
  });

  test('a blocked destination marks the job invalid rather than retryable', () => {
    assert.equal(
      getUserErrorInvalidReason(new BlockedFetchDestinationError('169.254.169.254')),
      DbJobInvalidReason.fetchDestinationBlocked
    );
  });
});
