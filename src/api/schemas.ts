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

const MetadataValue = Type.Union([
  Type.Object({}, { additionalProperties: true }),
  Type.String(),
  Type.Number(),
  Type.Integer(),
  Type.Boolean(),
  Type.Array(Type.Any()),
]);
export type MetadataValueType = Static<typeof MetadataValue>;

export const MetadataAttribute = Type.Object({
  trait_type: Type.String(),
  display_type: Type.Optional(Type.String()),
  value: MetadataValue,
});

export const MetadataProperties = Type.Record(Type.String(), MetadataValue);
export type MetadataPropertiesType = Static<typeof MetadataProperties>;

export const MetadataLocalization = Type.Object({
  uri: Type.String({ format: 'uri' }),
  default: Type.String(),
  locales: Type.Array(Type.String()),
});

export const Metadata = Type.Object({
  sip: Type.Integer(),
  name: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  image: Type.Optional(Type.String({ format: 'uri' })),
  cached_image: Type.Optional(Type.String({ format: 'uri' })),
  attributes: Type.Optional(Type.Array(MetadataAttribute)),
  properties: Type.Optional(MetadataProperties),
  localization: Type.Optional(MetadataLocalization),
});
export type MetadataType = Static<typeof Metadata>;

export const Name = Type.String();
export const Symbol = Type.String();
export const Decimals = Type.Integer();
export const TotalSupply = Type.String();
export const TokenUri = Type.String({ format: 'uri' });

export const TokenNotFoundResponse = Type.Object({
  error: Type.Literal('Token not found'),
});
export const TokenNotProcessedResponse = Type.Object({
  error: Type.Literal('Token metadata fetch in progress'),
});
export const TokenLocaleNotFoundResponse = Type.Object({
  error: Type.Literal('Locale not found'),
});
