import { Dispatcher } from 'undici';

function normalizeOrigin(origin: string): string {
  return new URL(origin).origin;
}

/**
 * Drops the named headers from a dispatch, whatever shape undici is carrying them in: the first
 * dispatch gets the object the caller passed, while a redirected one gets the flat
 * `[name, value, ...]` array the redirect handler rebuilds.
 * @param headers - headers for this hop
 * @param drop - lower cased header names to remove
 * @returns the headers without the dropped entries
 */
function withoutHeaders(
  headers: Dispatcher.DispatchOptions['headers'],
  drop: Set<string>
): Dispatcher.DispatchOptions['headers'] {
  if (Array.isArray(headers)) {
    const kept: string[] = [];
    for (let i = 0; i < headers.length; i += 2) {
      if (!drop.has(String(headers[i]).toLowerCase())) kept.push(headers[i], headers[i + 1]);
    }
    return kept;
  }
  if (headers && typeof headers === 'object') {
    return Object.fromEntries(
      Object.entries(headers).filter(([name]) => !drop.has(name.toLowerCase()))
    );
  }
  return headers;
}

/**
 * Strips gateway headers once a redirect leaves the origin they were issued for.
 *
 * Neither redirect implementation does this for us. `request`'s redirect interceptor sheds only
 * `authorization`, `cookie` and `proxy-authorization` across origins, and `fetch` sheds only
 * `authorization`; but `PUBLIC_GATEWAY_IPFS_EXTRA_HEADER` may name any header at all, so a gateway
 * API key would otherwise be handed to whatever origin that gateway points us at.
 *
 * Both paths re-dispatch every hop through the dispatcher, which is why one interceptor covers
 * them. On the metadata path it has to be composed *under* the redirect interceptor, since the
 * redirect handler re-dispatches through the interceptor below it rather than the whole chain.
 * @param origin - the origin the headers belong to
 * @param headerNames - names of the headers to strip elsewhere
 * @returns an interceptor enforcing that
 */
export function stripHeadersOffOrigin(
  origin: string,
  headerNames: string[]
): Dispatcher.DispatcherComposeInterceptor {
  const drop = new Set(headerNames.map(name => name.toLowerCase()));
  const normalizedOrigin = normalizeOrigin(origin);
  return dispatch => (opts, handler) => {
    if (normalizeOrigin(String(opts.origin)) === normalizedOrigin) return dispatch(opts, handler);
    return dispatch({ ...opts, headers: withoutHeaders(opts.headers, drop) }, handler);
  };
}
