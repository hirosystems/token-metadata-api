import * as postgres from 'postgres';
import { PgStore } from '../src/pg/pg-store';
import { buildApiServer } from '../src/api/init';
import { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { IncomingMessage, Server, ServerResponse } from 'http';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Payload, StacksEvent, StacksTransaction } from '@hirosystems/chainhook-client';
import { StacksTransactionSmartContractEvent } from '@hirosystems/chainhook-client';

export type TestFastifyServer = FastifyInstance<
  Server,
  IncomingMessage,
  ServerResponse,
  FastifyBaseLogger,
  TypeBoxTypeProvider
>;

export async function startTestApiServer(db: PgStore): Promise<TestFastifyServer> {
  return await buildApiServer({ db });
}

export const sleep = (time: number) => {
  return new Promise(resolve => setTimeout(resolve, time));
};

export const SIP_009_ABI = {
  maps: [
    {
      key: {
        tuple: [
          { name: 'id', type: 'uint128' },
          { name: 'operator', type: 'principal' },
          { name: 'owner', type: 'principal' },
        ],
      },
      name: 'approvals',
      value: 'bool',
    },
    {
      key: {
        tuple: [
          { name: 'operator', type: 'principal' },
          { name: 'owner', type: 'principal' },
        ],
      },
      name: 'approvals-all',
      value: 'bool',
    },
    {
      key: 'uint128',
      name: 'market',
      value: {
        tuple: [
          { name: 'commission', type: 'principal' },
          { name: 'price', type: 'uint128' },
        ],
      },
    },
    { key: 'principal', name: 'mint-pass', value: 'uint128' },
  ],
  functions: [
    {
      args: [
        { name: 'result', type: { response: { ok: 'bool', error: 'uint128' } } },
        { name: 'prior', type: { response: { ok: 'bool', error: 'uint128' } } },
      ],
      name: 'check-err',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'id', type: 'uint128' },
        { name: 'operator', type: 'principal' },
        { name: 'owner', type: 'principal' },
      ],
      name: 'is-owned-or-approved',
      access: 'private',
      outputs: { type: 'bool' },
    },
    {
      args: [{ name: 'entry', type: 'uint128' }],
      name: 'mint-token-helper',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'mintPrice', type: 'uint128' },
        { name: 'payer', type: 'principal' },
      ],
      name: 'paymint-split',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        {
          name: 'entry',
          type: {
            tuple: [
              { name: 'account', type: 'principal' },
              { name: 'limit', type: 'uint128' },
            ],
          },
        },
      ],
      name: 'set-mint-pass-helper',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'recipient', type: 'principal' },
        { name: 'id', type: 'uint128' },
      ],
      name: 'admin-mint-airdrop',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [{ name: 'entries', type: { list: { type: 'uint128', length: 20 } } }],
      name: 'batch-mint-token',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        {
          name: 'entries',
          type: {
            list: {
              type: {
                tuple: [
                  { name: 'account', type: 'principal' },
                  { name: 'limit', type: 'uint128' },
                ],
              },
              length: 200,
            },
          },
        },
      ],
      name: 'batch-set-mint-pass',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [{ name: 'entries', type: { list: { type: 'uint128', length: 200 } } }],
      name: 'batch-upgrade-v1-to-v2',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [{ name: 'id', type: 'uint128' }],
      name: 'burn',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'id', type: 'uint128' },
        { name: 'comm', type: 'trait_reference' },
      ],
      name: 'buy-in-ustx',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [],
      name: 'freeze-metadata',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'id', type: 'uint128' },
        { name: 'price', type: 'uint128' },
        { name: 'comm', type: 'trait_reference' },
      ],
      name: 'list-in-ustx',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [],
      name: 'mint-token',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [{ name: 'new-administrator', type: 'principal' }],
      name: 'set-administrator',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'id', type: 'uint128' },
        { name: 'operator', type: 'principal' },
        { name: 'approved', type: 'bool' },
      ],
      name: 'set-approved',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'none' } } },
    },
    {
      args: [
        { name: 'operator', type: 'principal' },
        { name: 'approved', type: 'bool' },
      ],
      name: 'set-approved-all',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'none' } } },
    },
    {
      args: [
        { name: 'account', type: 'principal' },
        { name: 'limit', type: 'uint128' },
      ],
      name: 'set-mint-pass',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [{ name: 'new-token-uri', type: { 'string-ascii': { length: 80 } } }],
      name: 'set-token-uri',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'id', type: 'uint128' },
        { name: 'owner', type: 'principal' },
        { name: 'recipient', type: 'principal' },
      ],
      name: 'transfer',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [{ name: 'id', type: 'uint128' }],
      name: 'unlist-in-ustx',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [{ name: 'id', type: 'uint128' }],
      name: 'upgrade-v1-to-v2',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [],
      name: 'get-last-token-id',
      access: 'read_only',
      outputs: { type: { response: { ok: 'uint128', error: 'none' } } },
    },
    {
      args: [{ name: 'id', type: 'uint128' }],
      name: 'get-listing-in-ustx',
      access: 'read_only',
      outputs: {
        type: {
          optional: {
            tuple: [
              { name: 'commission', type: 'principal' },
              { name: 'price', type: 'uint128' },
            ],
          },
        },
      },
    },
    {
      args: [{ name: 'account', type: 'principal' }],
      name: 'get-mint-pass-balance',
      access: 'read_only',
      outputs: { type: 'uint128' },
    },
    {
      args: [{ name: 'id', type: 'uint128' }],
      name: 'get-owner',
      access: 'read_only',
      outputs: { type: { response: { ok: { optional: 'principal' }, error: 'none' } } },
    },
    {
      args: [{ name: 'id', type: 'uint128' }],
      name: 'get-token-uri',
      access: 'read_only',
      outputs: {
        type: {
          response: { ok: { optional: { 'string-ascii': { length: 246 } } }, error: 'none' },
        },
      },
    },
    {
      args: [
        { name: 'id', type: 'uint128' },
        { name: 'operator', type: 'principal' },
      ],
      name: 'is-approved',
      access: 'read_only',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
  ],
  variables: [
    { name: 'COLLECTION-MAX-SUPPLY', type: 'uint128', access: 'constant' },
    {
      name: 'ERR-ADD-MINT-PASS',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-COLLECTION-LIMIT-REACHED',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-COULDNT-GET-NFT-OWNER',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-COULDNT-GET-V1-DATA',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-METADATA-FROZEN',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-MINT-PASS-LIMIT-REACHED',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-NFT-LISTED',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-NFT-NOT-LISTED-FOR-SALE',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-NOT-ADMINISTRATOR',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-NOT-AUTHORIZED',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-NOT-FOUND',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-NOT-OWNER',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-PAYMENT-ADDRESS',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-PRICE-WAS-ZERO',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-WRONG-COMMISSION',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    { name: 'MINT-PRICE', type: 'uint128', access: 'constant' },
    { name: 'token-name', type: { 'string-ascii': { length: 13 } }, access: 'constant' },
    { name: 'token-symbol', type: { 'string-ascii': { length: 6 } }, access: 'constant' },
    { name: 'wallet-1', type: 'principal', access: 'constant' },
    { name: 'wallet-2', type: 'principal', access: 'constant' },
    { name: 'wallet-3', type: 'principal', access: 'constant' },
    { name: 'wallet-4', type: 'principal', access: 'constant' },
    { name: 'wallet-5', type: 'principal', access: 'constant' },
    { name: 'wallet-6', type: 'principal', access: 'constant' },
    { name: 'wallet-7', type: 'principal', access: 'constant' },
    { name: 'administrator', type: 'principal', access: 'variable' },
    {
      name: 'collection-mint-addresses',
      type: { list: { type: 'principal', length: 4 } },
      access: 'variable',
    },
    {
      name: 'collection-mint-shares',
      type: { list: { type: 'uint128', length: 4 } },
      access: 'variable',
    },
    { name: 'metadata-frozen', type: 'bool', access: 'variable' },
    { name: 'mint-counter', type: 'uint128', access: 'variable' },
    { name: 'token-uri', type: { 'string-ascii': { length: 246 } }, access: 'variable' },
  ],
  fungible_tokens: [],
  non_fungible_tokens: [{ name: 'crashpunks-v2', type: 'uint128' }],
};

export const SIP_010_ABI = {
  maps: [],
  functions: [
    {
      args: [
        { name: 'result', type: { response: { ok: 'bool', error: 'uint128' } } },
        { name: 'prior', type: { response: { ok: 'bool', error: 'uint128' } } },
      ],
      name: 'check-err',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    { args: [], name: 'is-authorized-auth', access: 'private', outputs: { type: 'bool' } },
    {
      args: [
        {
          name: 'recipient',
          type: {
            tuple: [
              { name: 'amount', type: 'uint128' },
              { name: 'memo', type: { optional: { buffer: { length: 34 } } } },
              { name: 'to', type: 'principal' },
            ],
          },
        },
      ],
      name: 'send-token',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'amount', type: 'uint128' },
        { name: 'to', type: 'principal' },
        { name: 'memo', type: { optional: { buffer: { length: 34 } } } },
      ],
      name: 'send-token-with-memo',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'amountBonus', type: 'uint128' },
        { name: 'amount1', type: 'uint128' },
        { name: 'amount2', type: 'uint128' },
        { name: 'amount3', type: 'uint128' },
        { name: 'amount4', type: 'uint128' },
        { name: 'amount5', type: 'uint128' },
        { name: 'amountDefault', type: 'uint128' },
      ],
      name: 'set-coinbase-amounts',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'threshold1', type: 'uint128' },
        { name: 'threshold2', type: 'uint128' },
        { name: 'threshold3', type: 'uint128' },
        { name: 'threshold4', type: 'uint128' },
        { name: 'threshold5', type: 'uint128' },
      ],
      name: 'set-coinbase-thresholds',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'coreContract', type: 'principal' },
        { name: 'stacksHeight', type: 'uint128' },
      ],
      name: 'activate-token',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'amount', type: 'uint128' },
        { name: 'owner', type: 'principal' },
      ],
      name: 'burn',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [],
      name: 'convert-to-v2',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'amount', type: 'uint128' },
        { name: 'recipient', type: 'principal' },
      ],
      name: 'mint',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        {
          name: 'recipients',
          type: {
            list: {
              type: {
                tuple: [
                  { name: 'amount', type: 'uint128' },
                  { name: 'memo', type: { optional: { buffer: { length: 34 } } } },
                  { name: 'to', type: 'principal' },
                ],
              },
              length: 200,
            },
          },
        },
      ],
      name: 'send-many',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [{ name: 'newUri', type: { optional: { 'string-utf8': { length: 256 } } } }],
      name: 'set-token-uri',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'amount', type: 'uint128' },
        { name: 'from', type: 'principal' },
        { name: 'to', type: 'principal' },
        { name: 'memo', type: { optional: { buffer: { length: 34 } } } },
      ],
      name: 'transfer',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'amountBonus', type: 'uint128' },
        { name: 'amount1', type: 'uint128' },
        { name: 'amount2', type: 'uint128' },
        { name: 'amount3', type: 'uint128' },
        { name: 'amount4', type: 'uint128' },
        { name: 'amount5', type: 'uint128' },
        { name: 'amountDefault', type: 'uint128' },
      ],
      name: 'update-coinbase-amounts',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'threshold1', type: 'uint128' },
        { name: 'threshold2', type: 'uint128' },
        { name: 'threshold3', type: 'uint128' },
        { name: 'threshold4', type: 'uint128' },
        { name: 'threshold5', type: 'uint128' },
      ],
      name: 'update-coinbase-thresholds',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [{ name: 'user', type: 'principal' }],
      name: 'get-balance',
      access: 'read_only',
      outputs: { type: { response: { ok: 'uint128', error: 'none' } } },
    },
    {
      args: [],
      name: 'get-coinbase-amounts',
      access: 'read_only',
      outputs: {
        type: {
          response: {
            ok: {
              tuple: [
                { name: 'coinbaseAmount1', type: 'uint128' },
                { name: 'coinbaseAmount2', type: 'uint128' },
                { name: 'coinbaseAmount3', type: 'uint128' },
                { name: 'coinbaseAmount4', type: 'uint128' },
                { name: 'coinbaseAmount5', type: 'uint128' },
                { name: 'coinbaseAmountBonus', type: 'uint128' },
                { name: 'coinbaseAmountDefault', type: 'uint128' },
              ],
            },
            error: 'none',
          },
        },
      },
    },
    {
      args: [],
      name: 'get-coinbase-thresholds',
      access: 'read_only',
      outputs: {
        type: {
          response: {
            ok: {
              tuple: [
                { name: 'coinbaseThreshold1', type: 'uint128' },
                { name: 'coinbaseThreshold2', type: 'uint128' },
                { name: 'coinbaseThreshold3', type: 'uint128' },
                { name: 'coinbaseThreshold4', type: 'uint128' },
                { name: 'coinbaseThreshold5', type: 'uint128' },
              ],
            },
            error: 'uint128',
          },
        },
      },
    },
    {
      args: [],
      name: 'get-decimals',
      access: 'read_only',
      outputs: { type: { response: { ok: 'uint128', error: 'none' } } },
    },
    {
      args: [],
      name: 'get-name',
      access: 'read_only',
      outputs: {
        type: { response: { ok: { 'string-ascii': { length: 15 } }, error: 'none' } },
      },
    },
    {
      args: [],
      name: 'get-symbol',
      access: 'read_only',
      outputs: {
        type: { response: { ok: { 'string-ascii': { length: 3 } }, error: 'none' } },
      },
    },
    {
      args: [],
      name: 'get-token-uri',
      access: 'read_only',
      outputs: {
        type: {
          response: { ok: { optional: { 'string-utf8': { length: 256 } } }, error: 'none' },
        },
      },
    },
    {
      args: [],
      name: 'get-total-supply',
      access: 'read_only',
      outputs: { type: { response: { ok: 'uint128', error: 'none' } } },
    },
  ],
  variables: [
    { name: 'DECIMALS', type: 'uint128', access: 'constant' },
    {
      name: 'ERR_INVALID_COINBASE_AMOUNT',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR_INVALID_COINBASE_THRESHOLD',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR_TOKEN_ALREADY_ACTIVATED',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR_TOKEN_NOT_ACTIVATED',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR_UNAUTHORIZED',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR_V1_BALANCE_NOT_FOUND',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    { name: 'MICRO_CITYCOINS', type: 'uint128', access: 'constant' },
    { name: 'STATE_ACTIVE', type: 'uint128', access: 'constant' },
    { name: 'STATE_DEPLOYED', type: 'uint128', access: 'constant' },
    { name: 'STATE_INACTIVE', type: 'uint128', access: 'constant' },
    { name: 'TOKEN_BONUS_PERIOD', type: 'uint128', access: 'constant' },
    { name: 'TOKEN_EPOCH_LENGTH', type: 'uint128', access: 'constant' },
    { name: 'coinbaseAmount1', type: 'uint128', access: 'variable' },
    { name: 'coinbaseAmount2', type: 'uint128', access: 'variable' },
    { name: 'coinbaseAmount3', type: 'uint128', access: 'variable' },
    { name: 'coinbaseAmount4', type: 'uint128', access: 'variable' },
    { name: 'coinbaseAmount5', type: 'uint128', access: 'variable' },
    { name: 'coinbaseAmountBonus', type: 'uint128', access: 'variable' },
    { name: 'coinbaseAmountDefault', type: 'uint128', access: 'variable' },
    { name: 'coinbaseThreshold1', type: 'uint128', access: 'variable' },
    { name: 'coinbaseThreshold2', type: 'uint128', access: 'variable' },
    { name: 'coinbaseThreshold3', type: 'uint128', access: 'variable' },
    { name: 'coinbaseThreshold4', type: 'uint128', access: 'variable' },
    { name: 'coinbaseThreshold5', type: 'uint128', access: 'variable' },
    { name: 'tokenActivated', type: 'bool', access: 'variable' },
    {
      name: 'tokenUri',
      type: { optional: { 'string-utf8': { length: 256 } } },
      access: 'variable',
    },
  ],
  fungible_tokens: [{ name: 'newyorkcitycoin' }],
  non_fungible_tokens: [],
};

export const SIP_013_ABI = {
  maps: [
    { key: 'principal', name: 'approved-contracts', value: 'bool' },
    {
      key: {
        tuple: [
          { name: 'owner', type: 'principal' },
          { name: 'token-id', type: 'uint128' },
        ],
      },
      name: 'token-balances',
      value: 'uint128',
    },
    {
      key: 'principal',
      name: 'token-owned',
      value: { list: { type: 'uint128', length: 200 } },
    },
    { key: 'uint128', name: 'token-supplies', value: 'uint128' },
  ],
  functions: [
    {
      args: [],
      name: 'check-is-approved',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [],
      name: 'check-is-owner',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'token-id', type: 'uint128' },
        { name: 'balance', type: 'uint128' },
      ],
      name: 'create-tuple-token-balance',
      access: 'private',
      outputs: {
        type: {
          tuple: [
            { name: 'balance', type: 'uint128' },
            { name: 'token-id', type: 'uint128' },
          ],
        },
      },
    },
    {
      args: [{ name: 'amount', type: 'uint128' }],
      name: 'decimals-to-fixed',
      access: 'private',
      outputs: { type: 'uint128' },
    },
    {
      args: [
        { name: 'token-id', type: 'uint128' },
        { name: 'who', type: 'principal' },
      ],
      name: 'get-balance-or-default',
      access: 'private',
      outputs: { type: 'uint128' },
    },
    { args: [], name: 'pow-decimals', access: 'private', outputs: { type: 'uint128' } },
    {
      args: [
        { name: 'token-id', type: 'uint128' },
        { name: 'balance', type: 'uint128' },
        { name: 'owner', type: 'principal' },
      ],
      name: 'set-balance',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        {
          name: 'item',
          type: {
            tuple: [
              { name: 'amount', type: 'uint128' },
              { name: 'recipient', type: 'principal' },
              { name: 'sender', type: 'principal' },
              { name: 'token-id', type: 'uint128' },
            ],
          },
        },
        { name: 'previous-response', type: { response: { ok: 'bool', error: 'uint128' } } },
      ],
      name: 'transfer-many-fixed-iter',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        {
          name: 'item',
          type: {
            tuple: [
              { name: 'amount', type: 'uint128' },
              { name: 'recipient', type: 'principal' },
              { name: 'sender', type: 'principal' },
              { name: 'token-id', type: 'uint128' },
            ],
          },
        },
        { name: 'previous-response', type: { response: { ok: 'bool', error: 'uint128' } } },
      ],
      name: 'transfer-many-iter',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        {
          name: 'item',
          type: {
            tuple: [
              { name: 'amount', type: 'uint128' },
              { name: 'memo', type: { buffer: { length: 34 } } },
              { name: 'recipient', type: 'principal' },
              { name: 'sender', type: 'principal' },
              { name: 'token-id', type: 'uint128' },
            ],
          },
        },
        { name: 'previous-response', type: { response: { ok: 'bool', error: 'uint128' } } },
      ],
      name: 'transfer-many-memo-fixed-iter',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        {
          name: 'item',
          type: {
            tuple: [
              { name: 'amount', type: 'uint128' },
              { name: 'memo', type: { buffer: { length: 34 } } },
              { name: 'recipient', type: 'principal' },
              { name: 'sender', type: 'principal' },
              { name: 'token-id', type: 'uint128' },
            ],
          },
        },
        { name: 'previous-response', type: { response: { ok: 'bool', error: 'uint128' } } },
      ],
      name: 'transfer-many-memo-iter',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [{ name: 'new-approved-contract', type: 'principal' }],
      name: 'add-approved-contract',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'token-id', type: 'uint128' },
        { name: 'amount', type: 'uint128' },
        { name: 'sender', type: 'principal' },
      ],
      name: 'burn',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'token-id', type: 'uint128' },
        { name: 'amount', type: 'uint128' },
        { name: 'sender', type: 'principal' },
      ],
      name: 'burn-fixed',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'token-id', type: 'uint128' },
        { name: 'amount', type: 'uint128' },
        { name: 'recipient', type: 'principal' },
      ],
      name: 'mint',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'token-id', type: 'uint128' },
        { name: 'amount', type: 'uint128' },
        { name: 'recipient', type: 'principal' },
      ],
      name: 'mint-fixed',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'owner', type: 'principal' },
        { name: 'approved', type: 'bool' },
      ],
      name: 'set-approved-contract',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [{ name: 'owner', type: 'principal' }],
      name: 'set-contract-owner',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [{ name: 'new-transferrable', type: 'bool' }],
      name: 'set-transferrable',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'token-id', type: 'uint128' },
        { name: 'amount', type: 'uint128' },
        { name: 'sender', type: 'principal' },
        { name: 'recipient', type: 'principal' },
      ],
      name: 'transfer',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'token-id', type: 'uint128' },
        { name: 'amount', type: 'uint128' },
        { name: 'sender', type: 'principal' },
        { name: 'recipient', type: 'principal' },
      ],
      name: 'transfer-fixed',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        {
          name: 'transfers',
          type: {
            list: {
              type: {
                tuple: [
                  { name: 'amount', type: 'uint128' },
                  { name: 'recipient', type: 'principal' },
                  { name: 'sender', type: 'principal' },
                  { name: 'token-id', type: 'uint128' },
                ],
              },
              length: 200,
            },
          },
        },
      ],
      name: 'transfer-many',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        {
          name: 'transfers',
          type: {
            list: {
              type: {
                tuple: [
                  { name: 'amount', type: 'uint128' },
                  { name: 'recipient', type: 'principal' },
                  { name: 'sender', type: 'principal' },
                  { name: 'token-id', type: 'uint128' },
                ],
              },
              length: 200,
            },
          },
        },
      ],
      name: 'transfer-many-fixed',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        {
          name: 'transfers',
          type: {
            list: {
              type: {
                tuple: [
                  { name: 'amount', type: 'uint128' },
                  { name: 'memo', type: { buffer: { length: 34 } } },
                  { name: 'recipient', type: 'principal' },
                  { name: 'sender', type: 'principal' },
                  { name: 'token-id', type: 'uint128' },
                ],
              },
              length: 200,
            },
          },
        },
      ],
      name: 'transfer-many-memo',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        {
          name: 'transfers',
          type: {
            list: {
              type: {
                tuple: [
                  { name: 'amount', type: 'uint128' },
                  { name: 'memo', type: { buffer: { length: 34 } } },
                  { name: 'recipient', type: 'principal' },
                  { name: 'sender', type: 'principal' },
                  { name: 'token-id', type: 'uint128' },
                ],
              },
              length: 200,
            },
          },
        },
      ],
      name: 'transfer-many-memo-fixed',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'token-id', type: 'uint128' },
        { name: 'amount', type: 'uint128' },
        { name: 'sender', type: 'principal' },
        { name: 'recipient', type: 'principal' },
        { name: 'memo', type: { buffer: { length: 34 } } },
      ],
      name: 'transfer-memo',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'token-id', type: 'uint128' },
        { name: 'amount', type: 'uint128' },
        { name: 'sender', type: 'principal' },
        { name: 'recipient', type: 'principal' },
        { name: 'memo', type: { buffer: { length: 34 } } },
      ],
      name: 'transfer-memo-fixed',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [{ name: 'amount', type: 'uint128' }],
      name: 'fixed-to-decimals',
      access: 'read_only',
      outputs: { type: 'uint128' },
    },
    {
      args: [
        { name: 'token-id', type: 'uint128' },
        { name: 'who', type: 'principal' },
      ],
      name: 'get-balance',
      access: 'read_only',
      outputs: { type: { response: { ok: 'uint128', error: 'none' } } },
    },
    {
      args: [
        { name: 'token-id', type: 'uint128' },
        { name: 'who', type: 'principal' },
      ],
      name: 'get-balance-fixed',
      access: 'read_only',
      outputs: { type: { response: { ok: 'uint128', error: 'none' } } },
    },
    {
      args: [],
      name: 'get-contract-owner',
      access: 'read_only',
      outputs: { type: { response: { ok: 'principal', error: 'none' } } },
    },
    {
      args: [{ name: 'token-id', type: 'uint128' }],
      name: 'get-decimals',
      access: 'read_only',
      outputs: { type: { response: { ok: 'uint128', error: 'none' } } },
    },
    {
      args: [{ name: 'who', type: 'principal' }],
      name: 'get-overall-balance',
      access: 'read_only',
      outputs: { type: { response: { ok: 'uint128', error: 'none' } } },
    },
    {
      args: [{ name: 'who', type: 'principal' }],
      name: 'get-overall-balance-fixed',
      access: 'read_only',
      outputs: { type: { response: { ok: 'uint128', error: 'none' } } },
    },
    {
      args: [],
      name: 'get-overall-supply',
      access: 'read_only',
      outputs: { type: { response: { ok: 'uint128', error: 'none' } } },
    },
    {
      args: [],
      name: 'get-overall-supply-fixed',
      access: 'read_only',
      outputs: { type: { response: { ok: 'uint128', error: 'none' } } },
    },
    {
      args: [{ name: 'owner', type: 'principal' }],
      name: 'get-token-balance-owned-in-fixed',
      access: 'read_only',
      outputs: {
        type: {
          list: {
            type: {
              tuple: [
                { name: 'balance', type: 'uint128' },
                { name: 'token-id', type: 'uint128' },
              ],
            },
            length: 200,
          },
        },
      },
    },
    {
      args: [{ name: 'owner', type: 'principal' }],
      name: 'get-token-owned',
      access: 'read_only',
      outputs: { type: { list: { type: 'uint128', length: 200 } } },
    },
    {
      args: [{ name: 'token-id', type: 'uint128' }],
      name: 'get-token-uri',
      access: 'read_only',
      outputs: {
        type: {
          response: { ok: { optional: { 'string-utf8': { length: 256 } } }, error: 'none' },
        },
      },
    },
    {
      args: [{ name: 'token-id', type: 'uint128' }],
      name: 'get-total-supply',
      access: 'read_only',
      outputs: { type: { response: { ok: 'uint128', error: 'none' } } },
    },
    {
      args: [{ name: 'token-id', type: 'uint128' }],
      name: 'get-total-supply-fixed',
      access: 'read_only',
      outputs: { type: { response: { ok: 'uint128', error: 'none' } } },
    },
    {
      args: [],
      name: 'get-transferrable',
      access: 'read_only',
      outputs: { type: { response: { ok: 'bool', error: 'none' } } },
    },
  ],
  variables: [
    {
      name: 'ERR-INVALID-BALANCE',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-NOT-AUTHORIZED',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-TOO-MANY-POOLS',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-TRANSFER-FAILED',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    { name: 'ONE_8', type: 'uint128', access: 'constant' },
    { name: 'contract-owner', type: 'principal', access: 'variable' },
    { name: 'token-decimals', type: 'uint128', access: 'variable' },
    { name: 'token-name', type: { 'string-ascii': { length: 32 } }, access: 'variable' },
    { name: 'token-symbol', type: { 'string-ascii': { length: 32 } }, access: 'variable' },
    {
      name: 'token-uri',
      type: { optional: { 'string-utf8': { length: 256 } } },
      access: 'variable',
    },
    { name: 'transferrable', type: 'bool', access: 'variable' },
  ],
  fungible_tokens: [{ name: 'key-alex-autoalex-v1' }],
  non_fungible_tokens: [],
};

export class TestChainhookPayloadBuilder {
  private payload: Payload = {
    apply: [],
    rollback: [],
    chainhook: {
      uuid: 'test',
      predicate: {
        scope: 'ordinals_protocol',
        operation: 'inscription_feed',
      },
      is_streaming_blocks: true,
    },
  };
  private action: 'apply' | 'rollback' = 'apply';
  private get lastBlock(): StacksEvent {
    return this.payload[this.action][this.payload[this.action].length - 1] as StacksEvent;
  }
  private get lastBlockTx(): StacksTransaction {
    return this.lastBlock.transactions[this.lastBlock.transactions.length - 1];
  }

  streamingBlocks(streaming: boolean): this {
    this.payload.chainhook.is_streaming_blocks = streaming;
    return this;
  }

  apply(): this {
    this.action = 'apply';
    return this;
  }

  rollback(): this {
    this.action = 'rollback';
    return this;
  }

  block(args: { height: number; hash?: string; timestamp?: number }): this {
    this.payload[this.action].push({
      block_identifier: {
        hash: args.hash ?? '0x9430a78c5e166000980136a22764af72ff0f734b2108e33cfe5f9e3d4430adda',
        index: args.height,
      },
      metadata: {
        bitcoin_anchor_block_identifier: {
          hash: '0x0000000000000000000bb26339f877f36e92d5a11d75fc2e34aed3f7623937fe',
          index: 705573,
        },
        confirm_microblock_identifier: null,
        pox_cycle_index: 18,
        pox_cycle_length: 2100,
        pox_cycle_position: 1722,
        stacks_block_hash: '0xbccf63ec2438cf497786ce617ec7e64e2b27ee023a28a0927ee36b81870115d2',
      },
      parent_block_identifier: {
        hash: '0xca71af03f9a3012491af2f59f3244ecb241551803d641f8c8306ffa1187938b4',
        index: args.height - 1,
      },
      timestamp: 1634572508,
      transactions: [],
    } as StacksEvent);
    return this;
  }

  transaction(args: { hash: string; sender?: string }): this {
    this.lastBlock.transactions.push({
      metadata: {
        description:
          'invoked: SP466FNC0P7JWTNM2R9T199QRZN1MYEDTAR0KP27.miamicoin-token::transfer(u144, SP3HXJJMJQ06GNAZ8XWDN1QM48JEDC6PP6W3YZPZJ, SPCXZRY4FQZQHQ1EMBSDM1183HDK2ZGHPW3M1MA4, (some 0x54657374205472616e73666572202331))',
        execution_cost: {
          read_count: 5,
          read_length: 5526,
          runtime: 6430000,
          write_count: 2,
          write_length: 1,
        },
        fee: 2574302,
        kind: {
          data: {
            args: [
              'u144',
              'SP3HXJJMJQ06GNAZ8XWDN1QM48JEDC6PP6W3YZPZJ',
              'SPCXZRY4FQZQHQ1EMBSDM1183HDK2ZGHPW3M1MA4',
              '(some 0x54657374205472616e73666572202331)',
            ],
            contract_identifier: 'SP466FNC0P7JWTNM2R9T199QRZN1MYEDTAR0KP27.miamicoin-token',
            method: 'transfer',
          },
          type: 'ContractCall',
        },
        nonce: 8665,
        position: { index: 1 },
        proof: null,
        raw_tx:
          '0x00000000010400e3d94a92b80d0aabe8ef1b50de84449cd61ad63700000000000021d900000000002747de010121c61d96330e34d39bccaa78eb216b25ed05753fd2860e5c99341995421e382c521908da361ee2e71b3f46912ba3821c83e429fc843ef76b7752fae88a0db9bc030200000001010216e3d94a92b80d0aabe8ef1b50de84449cd61ad6371608633eac058f2e6ab41613a0a537c7ea1a79cdd20f6d69616d69636f696e2d746f6b656e096d69616d69636f696e010000000000000090021608633eac058f2e6ab41613a0a537c7ea1a79cdd20f6d69616d69636f696e2d746f6b656e087472616e736665720000000401000000000000000000000000000000900516e3d94a92b80d0aabe8ef1b50de84449cd61ad637051619dfe3c47dff78dc2ea2f2da04281c5b317e11b70a020000001054657374205472616e73666572202331',
        receipt: {
          contract_calls_stack: [],
          events: [],
          mutated_assets_radius: [
            'SP466FNC0P7JWTNM2R9T199QRZN1MYEDTAR0KP27.miamicoin-token::miamicoin',
          ],
          mutated_contracts_radius: ['SP466FNC0P7JWTNM2R9T199QRZN1MYEDTAR0KP27.miamicoin-token'],
        },
        result: '(ok true)',
        sender: args.sender ?? 'SP3HXJJMJQ06GNAZ8XWDN1QM48JEDC6PP6W3YZPZJ',
        success: true,
      },
      operations: [
        {
          account: { address: 'SP3HXJJMJQ06GNAZ8XWDN1QM48JEDC6PP6W3YZPZJ' },
          amount: {
            currency: {
              decimals: 6,
              metadata: {
                asset_class_identifier:
                  'SP466FNC0P7JWTNM2R9T199QRZN1MYEDTAR0KP27.miamicoin-token::miamicoin',
                asset_identifier: null,
                standard: 'SIP10',
              },
              symbol: 'TOKEN',
            },
            value: 144,
          },
          operation_identifier: { index: 0 },
          related_operations: [{ index: 1 }],
          status: 'SUCCESS',
          type: 'DEBIT',
        },
        {
          account: { address: 'SPCXZRY4FQZQHQ1EMBSDM1183HDK2ZGHPW3M1MA4' },
          amount: {
            currency: {
              decimals: 6,
              metadata: {
                asset_class_identifier:
                  'SP466FNC0P7JWTNM2R9T199QRZN1MYEDTAR0KP27.miamicoin-token::miamicoin',
                asset_identifier: null,
                standard: 'SIP10',
              },
              symbol: 'TOKEN',
            },
            value: 144,
          },
          operation_identifier: { index: 1 },
          related_operations: [{ index: 0 }],
          status: 'SUCCESS',
          type: 'CREDIT',
        },
      ],
      transaction_identifier: {
        hash: args.hash,
      },
    });
    return this;
  }

  printEvent(args: StacksTransactionSmartContractEvent): this {
    this.lastBlockTx.metadata.receipt.events.push(args);
    return this;
  }

  build(): Payload {
    return this.payload;
  }
}
