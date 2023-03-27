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

const MetadataValue = Type.Any({ title: 'Metadata Value', examples: ['value'] });
export type MetadataValueType = Static<typeof MetadataValue>;

export const MetadataAttribute = Type.Object(
  {
    trait_type: Type.String({ examples: ['Background'] }),
    display_type: Type.Optional(Type.String({ examples: ['string'] })),
    value: MetadataValue,
  },
  { title: 'Metadata Attribute' }
);

export const MetadataProperties = Type.Record(Type.String(), MetadataValue, {
  title: 'Metadata Properties',
  examples: [
    {
      collection: 'Foo Collection',
      total_supply: '10000',
    },
  ],
});
export type MetadataPropertiesType = Static<typeof MetadataProperties>;

export const MetadataLocalization = Type.Object(
  {
    uri: Type.String({ format: 'uri', examples: ['http://token.com/metadata?hl={locale}'] }),
    default: Type.String({ examples: ['en'] }),
    locales: Type.Array(Type.String(), { examples: [['en', 'jp']] }),
  },
  { title: 'Metadata Localization' }
);

const TokenDescription = Type.String({
  examples: [
    'Heavy hitters, all-stars and legends of the game join forces to create a collection of unique varsity jackets',
  ],
});

const TokenImage = Type.String({
  format: 'uri',
  examples: ['ipfs://ipfs/QmZMqhh2ztwuZ3Y8PyEp2z5auyH3TCm3nnr5ZfjjgDjd5q/12199.png'],
});

const TokenCachedImage = Type.String({
  format: 'uri',
  examples: ['https://ipfs.io/ipfs/QmZMqhh2ztwuZ3Y8PyEp2z5auyH3TCm3nnr5ZfjjgDjd5q/12199.png'],
});

export const Metadata = Type.Object(
  {
    sip: Type.Integer({ examples: [16] }),
    name: Type.Optional(Type.String({ examples: ["Satoshi's Team #12200"] })),
    description: Type.Optional(TokenDescription),
    image: Type.Optional(TokenImage),
    cached_image: Type.Optional(TokenCachedImage),
    attributes: Type.Optional(Type.Array(MetadataAttribute)),
    properties: Type.Optional(MetadataProperties),
    localization: Type.Optional(MetadataLocalization),
  },
  { title: 'Metadata' }
);
export type MetadataType = Static<typeof Metadata>;

export const TokenUri = Type.String({
  format: 'uri',
  examples: ['ipfs://ipfs/Qmf9yDYuPTrp8NRUFf8xxDd5Ud24Dx9uYMwMn8o8G2cWPW/12200.json'],
});

export const TokenNotFoundResponse = Type.Object(
  {
    error: Type.Literal('Token not found'),
  },
  { title: 'Token Not Found Response' }
);

export const TokenNotProcessedResponse = Type.Object(
  {
    error: Type.Literal('Token metadata fetch in progress'),
  },
  { title: 'Token Metadata Fetch In Progress Response' }
);

export const TokenLocaleNotFoundResponse = Type.Object(
  {
    error: Type.Literal('Locale not found'),
  },
  { title: 'Locale Not Found Response' }
);

export const InvalidTokenContractResponse = Type.Object(
  {
    error: Type.Literal('Token contract is invalid or does not conform to its token standard'),
  },
  { title: 'Invalid Token Contract Response' }
);

export const InvalidTokenMetadataResponse = Type.Object(
  {
    error: Type.Literal('Token metadata is unreachable or does not conform to SIP-016'),
  },
  { title: 'Invalid Token Metadata Response' }
);

export const TokenErrorResponse = Type.Union(
  [
    TokenNotProcessedResponse,
    TokenLocaleNotFoundResponse,
    InvalidTokenContractResponse,
    InvalidTokenMetadataResponse,
  ],
  { title: 'Token Error Response' }
);

export const FtMetadataResponse = Type.Object(
  {
    name: Type.Optional(Type.String({ examples: ['Wrapped USD'] })),
    symbol: Type.Optional(Type.String({ examples: ['xUSD'] })),
    decimals: Type.Optional(Type.Integer({ examples: [8] })),
    total_supply: Type.Optional(Type.String({ examples: ['9999980000000'] })),
    token_uri: Type.Optional(TokenUri),
    description: Type.Optional(TokenDescription),
    image_uri: Type.Optional(TokenCachedImage),
    image_canonical_uri: Type.Optional(TokenImage),
    tx_id: Type.String({
      examples: ['0xef2ac1126e16f46843228b1dk4830e19eb7599129e4jf392cab9e65ae83a45c0'],
    }),
    sender_address: Type.String({ examples: ['ST399W7Z9WS0GMSNQGJGME5JAENKN56D65VGMGKGA'] }),
    metadata: Type.Optional(Metadata),
  },
  { title: 'Ft Metadata Response' }
);

export const NftMetadataResponse = Type.Object(
  {
    token_uri: Type.Optional(TokenUri),
    metadata: Type.Optional(Metadata),
  },
  { title: 'Nft Metadata Response' }
);

export const SftMetadataResponse = Type.Object(
  {
    token_uri: Type.Optional(TokenUri),
    decimals: Type.Optional(Type.Integer({ examples: [6] })),
    total_supply: Type.Optional(Type.String({ examples: ['250'] })),
    metadata: Type.Optional(Metadata),
  },
  { title: 'Sft Metadata Response' }
);

export const ApiStatusResponse = Type.Object(
  {
    server_version: Type.String({ examples: ['token-metadata-api v0.0.1 (master:a1b2c3)'] }),
    status: Type.String({ examples: ['ready'] }),
    tokens: Type.Optional(
      Type.Object(
        {
          ft: Type.Optional(Type.Integer({ examples: [512] })),
          nft: Type.Optional(Type.Integer({ examples: [493452] })),
          sft: Type.Optional(Type.Integer({ examples: [44] })),
        },
        { title: 'Api Token Count' }
      )
    ),
    token_contracts: Type.Optional(
      Type.Object(
        {
          'sip-009': Type.Optional(Type.Integer({ examples: [3101] })),
          'sip-010': Type.Optional(Type.Integer({ examples: [512] })),
          'sip-013': Type.Optional(Type.Integer({ examples: [11] })),
        },
        { title: 'Api Token Contract Count' }
      )
    ),
    job_queue: Type.Optional(
      Type.Object(
        {
          pending: Type.Optional(Type.Integer({ examples: [430562] })),
          queued: Type.Optional(Type.Integer({ examples: [512] })),
          done: Type.Optional(Type.Integer({ examples: [12532] })),
          failed: Type.Optional(Type.Integer({ examples: [11] })),
        },
        { title: 'Api Job Count' }
      )
    ),
  },
  { title: 'Api Status Response' }
);
