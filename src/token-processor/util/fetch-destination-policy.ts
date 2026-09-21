import dns from 'node:dns';
import net from 'node:net';
import { buildConnector } from 'undici';
import { BlockedFetchDestinationError } from './errors.js';

/**
 * IPv4 ranges the metadata worker is never allowed to contact. Token contracts choose their own
 * metadata URLs, so without this list any user could point a token at our internal network and use
 * the worker as a request proxy.
 */
const BLOCKED_IPV4_SUBNETS: [address: string, prefix: number][] = [
  ['0.0.0.0', 8], // "This network"
  ['10.0.0.0', 8], // Private
  ['100.64.0.0', 10], // Carrier-grade NAT
  ['127.0.0.0', 8], // Loopback
  ['169.254.0.0', 16], // Link-local, includes the 169.254.169.254 cloud metadata endpoint
  ['172.16.0.0', 12], // Private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // Private
  ['198.18.0.0', 15], // Benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // Multicast
  ['240.0.0.0', 4], // Reserved, includes the 255.255.255.255 broadcast address
];

/**
 * IPv6 equivalents of {@link BLOCKED_IPV4_SUBNETS}. Ranges that embed an arbitrary IPv4 address
 * (NAT64, Teredo, 6to4) are blocked wholesale rather than decoded, since none of them are
 * legitimate destinations for token metadata.
 *
 * IPv4-mapped addresses such as `::ffff:127.0.0.1` are deliberately absent: `net.BlockList` unmaps
 * them and evaluates them against the IPv4 rules above.
 */
const BLOCKED_IPV6_SUBNETS: [address: string, prefix: number][] = [
  ['::', 128], // Unspecified
  ['::1', 128], // Loopback
  ['64:ff9b::', 96], // NAT64
  ['64:ff9b:1::', 48], // Local-use NAT64
  ['100::', 64], // Discard-only
  ['2001::', 32], // Teredo
  ['2001:db8::', 32], // Documentation
  ['2002::', 16], // 6to4
  ['fc00::', 7], // Unique local, includes the fd00:ec2::254 cloud metadata endpoint
  ['fe80::', 10], // Link-local
  ['ff00::', 8], // Multicast
];

const BLOCKED_ADDRESSES = new net.BlockList();
for (const [address, prefix] of BLOCKED_IPV4_SUBNETS) {
  BLOCKED_ADDRESSES.addSubnet(address, prefix, 'ipv4');
}
for (const [address, prefix] of BLOCKED_IPV6_SUBNETS) {
  BLOCKED_ADDRESSES.addSubnet(address, prefix, 'ipv6');
}

const LOOPBACK_ADDRESSES = new net.BlockList();
LOOPBACK_ADDRESSES.addSubnet('127.0.0.0', 8, 'ipv4');
LOOPBACK_ADDRESSES.addSubnet('::1', 128, 'ipv6');

/**
 * Loopback is the one blocked range the test suite needs, because it serves image and metadata
 * fixtures from real `127.0.0.1` servers. Tests that assert loopback *is* blocked turn this off
 * with {@link setLoopbackAllowedForTesting}.
 */
let loopbackAllowed = process.env.NODE_ENV === 'test';

/**
 * Test-only escape hatch for the loopback exemption described above. Always restore the previous
 * value, since the policy is process-wide.
 * @param allowed - whether loopback destinations should be permitted
 * @returns the previous value
 */
export function setLoopbackAllowedForTesting(allowed: boolean): boolean {
  const previous = loopbackAllowed;
  loopbackAllowed = allowed;
  return previous;
}

/**
 * Determines if an IP address is off limits for metadata and image fetches. Anything that isn't a
 * parseable IP address is refused, since we can't prove it's public.
 * @param address - IPv4 or IPv6 address
 * @returns true if the worker must not connect to this address
 */
export function isBlockedIpAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 0) return true;
  const type = family === 4 ? 'ipv4' : 'ipv6';
  if (loopbackAllowed && LOOPBACK_ADDRESSES.check(address, type)) return false;
  return BLOCKED_ADDRESSES.check(address, type);
}

/**
 * Rejects a hostname if *any* of the addresses it resolved to is blocked. A partial rejection would
 * be pointless: a hostname that answers with both a public and a private address can hand us the
 * private one on any given connection attempt.
 * @param hostname - hostname that was resolved
 * @param addresses - every address the resolver returned
 * @throws BlockedFetchDestinationError if any address is not a permitted public address
 */
export function assertResolvedAddressesAllowed(
  hostname: string,
  addresses: dns.LookupAddress[]
): void {
  if (addresses.length === 0) {
    throw new BlockedFetchDestinationError(hostname);
  }
  const blocked = addresses.find(a => isBlockedIpAddress(a.address));
  if (blocked) {
    throw new BlockedFetchDestinationError(`${hostname} (resolved to ${blocked.address})`);
  }
}

/**
 * A `dns.lookup` replacement that validates every resolved address before the socket is opened, and
 * then hands back only those validated addresses. Returning them is what pins the destination:
 * `net.connect` uses this result directly instead of resolving again, so a hostname whose DNS
 * answer flips to a private address between validation and connection (DNS rebinding) can't take
 * effect.
 */
const validatingLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error, '', undefined);
      return;
    }
    try {
      assertResolvedAddressesAllowed(hostname, addresses);
    } catch (validationError) {
      callback(validationError as NodeJS.ErrnoException, '', undefined);
      return;
    }
    if (options.all) {
      callback(null, addresses);
    } else {
      callback(null, addresses[0].address, addresses[0].family);
    }
  });
};

/**
 * Builds an undici connector that refuses to open a socket to any non-public address.
 *
 * This is the single enforcement point for all outbound metadata and image traffic, which is why it
 * lives at the connector rather than at the URL: `fetch` resolves its redirect hops internally, so
 * a URL-level check would only ever see the first hop.
 * @param options - TLS/TCP options forwarded to the underlying undici connector
 * @returns a connector that validates the destination before connecting
 */
export function createFetchDestinationConnector(
  options: buildConnector.BuildOptions
): buildConnector.connector {
  const connect = buildConnector({ ...options, lookup: validatingLookup });
  return (connectOptions, callback) => {
    // `net.connect` skips DNS resolution entirely when the host is already an IP literal, so
    // `validatingLookup` never runs for URLs like `http://127.0.0.1/` or `http://[::1]/`. Those
    // have to be caught here.
    const { hostname } = connectOptions;
    if (net.isIP(hostname) !== 0 && isBlockedIpAddress(hostname)) {
      callback(new BlockedFetchDestinationError(hostname), null);
      return;
    }
    connect(connectOptions, callback);
  };
}
