import { FastifyReply, FastifyRequest } from 'fastify';
import { SmartContractRegEx } from '../schemas.js';
import { CACHE_CONTROL_MUST_REVALIDATE, parseIfNoneMatchHeader } from '@stacks/api-toolkit';
import { parseContractIdentifiers } from './helpers.js';
import { DbTokenCacheInfo } from '../../pg/types.js';

enum ETagType {
  chainTip = 'chain_tip',
  token = 'token',
  bulkToken = 'bulk_token',
}

async function handleCache(type: ETagType, request: FastifyRequest, reply: FastifyReply) {
  const ifNoneMatch = parseIfNoneMatchHeader(request.headers['if-none-match']);
  let cache: DbTokenCacheInfo | undefined;
  switch (type) {
    case ETagType.chainTip: {
      const chainTip = await request.server.db.core.getChainTip(request.server.db.sql);
      if (chainTip?.index_block_hash) cache = { etag: chainTip.index_block_hash };
      break;
    }
    case ETagType.token:
      cache = await getTokenCacheInfo(request);
      break;
    case ETagType.bulkToken: {
      const etag = await getBulkTokenEtag(request);
      if (etag) cache = { etag };
      break;
    }
  }
  if (cache?.etag) {
    const headers = cacheControlHeaders(cache);
    if (ifNoneMatch && ifNoneMatch.includes(cache.etag)) {
      await reply.headers(headers).code(304).send();
    } else {
      void reply.headers({ ...headers, ETag: `"${cache.etag}"` });
    }
  }
}

/**
 * Builds the freshness headers for a token response. Tokens marked as `dynamic` with an explicit
 * TTL (see SIP-019) can't change until that TTL elapses, so we advertise that lifetime to clients
 * in order to avoid revalidation requests that are not necessary. Everything else must be
 * revalidated on every request because it can change at any block.
 */
function cacheControlHeaders(cache: DbTokenCacheInfo): Record<string, string> {
  if (cache.maxAge === undefined) return { 'Cache-Control': CACHE_CONTROL_MUST_REVALIDATE };
  return {
    'Cache-Control': `public, max-age=${cache.maxAge}, must-revalidate`,
    Expires: new Date(Date.now() + cache.maxAge * 1000).toUTCString(),
  };
}

export async function handleTokenCache(request: FastifyRequest, reply: FastifyReply) {
  return handleCache(ETagType.token, request, reply);
}

export async function handleChainTipCache(request: FastifyRequest, reply: FastifyReply) {
  return handleCache(ETagType.chainTip, request, reply);
}

export async function handleBulkTokenCache(request: FastifyRequest, reply: FastifyReply) {
  return handleCache(ETagType.bulkToken, request, reply);
}

export function setReplyNonCacheable(reply: FastifyReply): void {
  void reply.removeHeader('Cache-Control');
  void reply.removeHeader('Expires');
  void reply.removeHeader('Etag');
}

/**
 * Retrieve the token's cache information, including its last modified date as a UNIX epoch so we
 * can use it as the response ETag.
 * @returns `DbTokenCacheInfo`
 */
async function getTokenCacheInfo(request: FastifyRequest): Promise<DbTokenCacheInfo | undefined> {
  try {
    const components = request.url.split('/');
    let tokenNumber: bigint = 1n;
    let contractPrincipal: string | undefined;
    do {
      const lastElement = components.pop();
      if (lastElement && lastElement.length) {
        if (SmartContractRegEx.test(lastElement)) {
          contractPrincipal = lastElement;
        } else if (/^\d+$/.test(lastElement)) {
          tokenNumber = BigInt(lastElement);
        }
      }
    } while (components.length);
    if (!contractPrincipal) return;
    return await request.server.db.getTokenCacheInfo({ contractPrincipal, tokenNumber });
  } catch (_error) {
    return undefined;
  }
}

async function getBulkTokenEtag(request: FastifyRequest): Promise<string | undefined> {
  try {
    const query = request.query as { contract?: string | string[] };
    const contracts = Array.isArray(query.contract)
      ? query.contract
      : query.contract
        ? [query.contract]
        : [];
    const pairs = parseContractIdentifiers(contracts);
    return await request.server.db.getBulkTokensEtag({ pairs });
  } catch (_error) {
    return undefined;
  }
}
