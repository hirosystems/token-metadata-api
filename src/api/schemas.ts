import { SwaggerOptions } from '@fastify/swagger';
import { Static, Type } from '@sinclair/typebox';
import { SERVER_VERSION } from '../server-version';

export const OpenApiSchemaOptions: SwaggerOptions = {
  openapi: {
    info: {
      title: 'Token Metadata API',
      description:
        'Service that indexes metadata for every SIP-009, SIP-010, and SIP-013 Token in the Stacks blockchain and exposes it via REST API endpoints.',
      version: SERVER_VERSION.tag,
    },
    externalDocs: {
      url: 'https://github.com/hirosystems/token-metadata-api',
      description: 'Source Repository',
    },
    servers: [
      {
        url: 'https://api.hiro.so/',
        description: 'mainnet',
      },
      {
        url: 'https://api.testnet.hiro.so/',
        description: 'testnet',
      },
    ],
    tags: [
      {
        name: 'Tokens',
        description: 'Token metadata endpoints',
      },
      {
        name: 'Status',
        description: 'Service status endpoints',
      },
    ],
  },
  exposeRoute: true,
};

// ==========================
// Parameters
// ==========================

export const SmartContractRegEx =
  /[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{28,41}\.[a-zA-Z]([a-zA-Z0-9]|[-_]){0,39}/;

export const TokenQuerystringParams = Type.Object({
  locale: Type.Optional(
    Type.String({
      title: 'Localization',
      description: 'Metadata localization to retrieve',
      examples: ['es-MX', 'jp'],
    })
  ),
});

export const FtPrincipalParam = Type.RegEx(SmartContractRegEx, {
  title: 'Fungible Token Contract Principal',
  description: 'Principal for the contract which owns the SIP-010 token',
  examples: ['SP32XCD69XPS3GKDEXAQ29PJRDSD5AR643GNEEBXZ.fari-token'],
});

export const NftPrincipalParam = Type.RegEx(SmartContractRegEx, {
  title: 'Non-Fungible Token Contract Principal',
  description: 'SIP-009 compliant smart contract principal',
  examples: ['SP497E7RX3233ATBS2AB9G4WTHB63X5PBSP5VGAQ.boomboxes-cycle-12'],
});

export const SftPrincipalParam = Type.RegEx(SmartContractRegEx, {
  title: 'Semi-Fungible Token Contract Principal',
  description: 'SIP-013 compliant smart contract principal',
  examples: ['SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1'],
});

export const TokenIdParam = Type.Integer({
  title: 'Token ID',
  description: 'Token ID to retrieve',
  examples: ['35'],
});

// ==========================
// Responses
// ==========================

const MetadataValue = Type.Union(
  [
    Type.Object({}, { additionalProperties: true }),
    Type.String(),
    Type.Number(),
    Type.Integer(),
    Type.Boolean(),
    Type.Array(Type.Any()),
  ],
  { examples: ['value'] }
);
export type MetadataValueType = Static<typeof MetadataValue>;

export const MetadataAttribute = Type.Object({
  trait_type: Type.String({ examples: ['Background'] }),
  display_type: Type.Optional(Type.String({ examples: ['string'] })),
  value: MetadataValue,
});

export const MetadataProperties = Type.Record(Type.String(), MetadataValue, {
  examples: [
    {
      collection: 'Foo Collection',
      total_supply: '10000',
    },
  ],
});
export type MetadataPropertiesType = Static<typeof MetadataProperties>;

export const MetadataLocalization = Type.Object({
  uri: Type.String({ format: 'uri', examples: ['http://token.com/metadata?hl={locale}'] }),
  default: Type.String({ examples: ['en'] }),
  locales: Type.Array(Type.String(), { examples: [['en', 'jp']] }),
});

export const Metadata = Type.Object({
  sip: Type.Integer({ examples: [16] }),
  name: Type.Optional(Type.String({ examples: ["Satoshi's Team #12200"] })),
  description: Type.Optional(
    Type.String({
      examples: [
        'Heavy hitters, all-stars and legends of the game join forces to create a collection of unique varsity jackets',
      ],
    })
  ),
  image: Type.Optional(
    Type.String({
      format: 'uri',
      examples: ['ipfs://ipfs/QmZMqhh2ztwuZ3Y8PyEp2z5auyH3TCm3nnr5ZfjjgDjd5q/12199.png'],
    })
  ),
  cached_image: Type.Optional(
    Type.String({
      format: 'uri',
      examples: ['https://ipfs.io/ipfs/QmZMqhh2ztwuZ3Y8PyEp2z5auyH3TCm3nnr5ZfjjgDjd5q/12199.png'],
    })
  ),
  attributes: Type.Optional(Type.Array(MetadataAttribute)),
  properties: Type.Optional(MetadataProperties),
  localization: Type.Optional(MetadataLocalization),
});
export type MetadataType = Static<typeof Metadata>;

export const TokenUri = Type.String({
  format: 'uri',
  examples: ['ipfs://ipfs/Qmf9yDYuPTrp8NRUFf8xxDd5Ud24Dx9uYMwMn8o8G2cWPW/12200.json'],
});

export const TokenNotFoundResponse = Type.Object({
  error: Type.Literal('Token not found'),
});
export const TokenNotProcessedResponse = Type.Object({
  error: Type.Literal('Token metadata fetch in progress'),
});
export const TokenLocaleNotFoundResponse = Type.Object({
  error: Type.Literal('Locale not found'),
});

export const FtMetadataResponse = Type.Object({
  name: Type.Optional(Type.String({ examples: ['Wrapped USD'] })),
  symbol: Type.Optional(Type.String({ examples: ['xUSD'] })),
  decimals: Type.Optional(Type.Integer({ examples: [8] })),
  total_supply: Type.Optional(Type.String({ examples: ['9999980000000'] })),
  token_uri: Type.Optional(TokenUri),
  metadata: Type.Optional(Metadata),
});

export const NftMetadataResponse = Type.Object({
  token_uri: Type.Optional(TokenUri),
  metadata: Type.Optional(Metadata),
});

export const SftMetadataResponse = Type.Object({
  token_uri: Type.Optional(TokenUri),
  decimals: Type.Optional(Type.Integer({ examples: [6] })),
  total_supply: Type.Optional(Type.String({ examples: ['250'] })),
  metadata: Type.Optional(Metadata),
});

export const ApiStatusResponse = Type.Object(
  {
    server_version: Type.String({ examples: ['token-metadata-api v0.0.1 (master:a1b2c3)'] }),
    status: Type.String({ examples: ['ready'] }),
    tokens: Type.Optional(
      Type.Object({
        ft: Type.Optional(Type.Integer({ examples: [512] })),
        nft: Type.Optional(Type.Integer({ examples: [493452] })),
        sft: Type.Optional(Type.Integer({ examples: [44] })),
      })
    ),
    token_contracts: Type.Optional(
      Type.Object({
        'sip-009': Type.Optional(Type.Integer({ examples: [3101] })),
        'sip-010': Type.Optional(Type.Integer({ examples: [512] })),
        'sip-013': Type.Optional(Type.Integer({ examples: [11] })),
      })
    ),
    job_queue: Type.Optional(
      Type.Object({
        pending: Type.Optional(Type.Integer({ examples: [430562] })),
        queued: Type.Optional(Type.Integer({ examples: [512] })),
        done: Type.Optional(Type.Integer({ examples: [12532] })),
        failed: Type.Optional(Type.Integer({ examples: [11] })),
      })
    ),
  },
  { title: 'Status Response' }
);
