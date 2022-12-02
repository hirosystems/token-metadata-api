import envSchema from 'env-schema';

interface Env {
  API_HOST: string;
  API_PORT: number;

  PGHOST: string;
  PGPORT: number;
  PGUSER: string;
  PGPASSWORD: string;
  PGDATABASE: string;
  /**
   * Limit to how many concurrent connections can be created, defaults to 10. Make sure this number
   * is greater than `JOB_QUEUE_CONCURRENCY_LIMIT`.
   */
  PG_CONNECTION_POOL_MAX: number;
  PG_IDLE_TIMEOUT: number;
  PG_MAX_LIFETIME: number;

  BLOCKCHAIN_API_PGHOST: string;
  BLOCKCHAIN_API_PGPORT: number;
  BLOCKCHAIN_API_PGUSER: string;
  BLOCKCHAIN_API_PGPASSWORD: string;
  BLOCKCHAIN_API_PGDATABASE: string;
  BLOCKCHAIN_API_PG_CONNECTION_POOL_MAX: number;
  BLOCKCHAIN_API_PG_IDLE_TIMEOUT: number;
  BLOCKCHAIN_API_PG_MAX_LIFETIME: number;

  STACKS_NODE_RPC_HOST: string;
  STACKS_NODE_RPC_PORT: number;

  /**
   * The max number of immediate attempts that will be made to retrieve metadata from external URIs
   * before declaring the failure as a non-retryable error.
   */
  METADATA_MAX_IMMEDIATE_URI_RETRIES: number;
  METADATA_FETCH_TIMEOUT_MS: number;
  /**
   * The maximum number of bytes of metadata to fetch. If the fetch encounters more bytes than this
   * limit it throws and the metadata is not processed.
   */
  METADATA_MAX_PAYLOAD_BYTE_SIZE: number;
  /**
   * Configure a script to handle image URLs during token metadata processing. Must be an executable
   * script that accepts the URL as the first program argument and outputs a result URL to stdout.
   */
  METADATA_IMAGE_CACHE_PROCESSOR: string;

  JOB_QUEUE_STRICT_MODE: boolean;
  JOB_QUEUE_CONCURRENCY_LIMIT: number;
  JOB_QUEUE_SIZE_LIMIT: number;
  JOB_QUEUE_MAX_RETRIES: number;

  /**
   * Base URL for a public gateway which will provide access to all IPFS resources. Defaults to
   * `https://cloudflare-ipfs.com`.
   */
  PUBLIC_GATEWAY_IPFS: string;
  /**
   * Base URL for a public gateway which will provide access to all Arweave resources. Defaults to
   * `https://arweave.net`.
   */
  PUBLIC_GATEWAY_ARWEAVE: string;
}

export function getEnvVars(): Env {
  const schema = {
    type: 'object',
    required: [
      'API_HOST',
      'API_PORT',
      'PGHOST',
      'PGPORT',
      'PGUSER',
      'PGPASSWORD',
      'PGDATABASE',
      'BLOCKCHAIN_API_PGHOST',
      'BLOCKCHAIN_API_PGPORT',
      'BLOCKCHAIN_API_PGUSER',
      'BLOCKCHAIN_API_PGPASSWORD',
      'BLOCKCHAIN_API_PGDATABASE',
      'STACKS_NODE_RPC_HOST',
      'STACKS_NODE_RPC_PORT',
      'PUBLIC_GATEWAY_IPFS',
      'PUBLIC_GATEWAY_ARWEAVE',
    ],
    properties: {
      API_HOST: {
        type: 'string',
      },
      API_PORT: {
        type: 'number',
        default: 3000,
        minimum: 0,
        maximum: 65535,
      },
      PGHOST: {
        type: 'string',
      },
      PGPORT: {
        type: 'number',
        default: 5432,
        minimum: 0,
        maximum: 65535,
      },
      PGUSER: {
        type: 'string',
      },
      PGPASSWORD: {
        type: 'string',
      },
      PGDATABASE: {
        type: 'string',
      },
      PG_CONNECTION_POOL_MAX: {
        type: 'number',
        default: 10,
      },
      PG_IDLE_TIMEOUT: {
        type: 'number',
        default: 30,
      },
      PG_MAX_LIFETIME: {
        type: 'number',
        default: 60,
      },
      BLOCKCHAIN_API_PGHOST: {
        type: 'string',
      },
      BLOCKCHAIN_API_PGPORT: {
        type: 'number',
        default: 5432,
        minimum: 0,
        maximum: 65535,
      },
      BLOCKCHAIN_API_PGUSER: {
        type: 'string',
      },
      BLOCKCHAIN_API_PGPASSWORD: {
        type: 'string',
      },
      BLOCKCHAIN_API_PGDATABASE: {
        type: 'string',
      },
      BLOCKCHAIN_API_PG_CONNECTION_POOL_MAX: {
        type: 'number',
        default: 10,
      },
      BLOCKCHAIN_API_PG_IDLE_TIMEOUT: {
        type: 'number',
        default: 30,
      },
      BLOCKCHAIN_API_PG_MAX_LIFETIME: {
        type: 'number',
        default: 60,
      },
      STACKS_NODE_RPC_HOST: {
        type: 'string',
      },
      STACKS_NODE_RPC_PORT: {
        type: 'number',
        minimum: 0,
        maximum: 65535,
      },
      JOB_QUEUE_STRICT_MODE: {
        type: 'boolean',
        default: true,
      },
      JOB_QUEUE_MAX_RETRIES: {
        type: 'number',
        default: 5,
      },
      METADATA_FETCH_TIMEOUT_MS: {
        type: 'number',
        default: 10_000,
      },
      METADATA_MAX_PAYLOAD_BYTE_SIZE: {
        type: 'number',
        default: 1_000_000, // 1 MB
      },
      METADATA_IMAGE_CACHE_PROCESSOR: {
        type: 'string',
      },
      JOB_QUEUE_CONCURRENCY_LIMIT: {
        type: 'number',
        default: 5,
      },
      JOB_QUEUE_SIZE_LIMIT: {
        type: 'number',
        default: 200,
      },
      PUBLIC_GATEWAY_IPFS: {
        type: 'string',
        default: 'https://cloudflare-ipfs.com/ipfs',
      },
      PUBLIC_GATEWAY_ARWEAVE: {
        type: 'string',
        default: 'https://arweave.net',
      },
    },
  };
  const config = envSchema<Env>({
    schema: schema,
    dotenv: true,
  });
  return config;
}

export const ENV = getEnvVars();
