import envSchema from 'env-schema';

interface Env {
  API_HOST: string;
  API_PORT: number;

  PGHOST: string;
  PGPORT: number;
  PGUSER: string;
  PGPASSWORD: string;
  PGDATABASE: string;
  BLOCKCHAIN_API_PGHOST: string;
  BLOCKCHAIN_API_PGPORT: number;
  BLOCKCHAIN_API_PGUSER: string;
  BLOCKCHAIN_API_PGPASSWORD: string;
  BLOCKCHAIN_API_PGDATABASE: string;

  STACKS_NODE_RPC_HOST: string;
  STACKS_NODE_RPC_PORT: number;

  METADATA_STRICT_MODE: boolean;
  METADATA_MAX_RETRIES: number;
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

  JOB_QUEUE_CONCURRENCY_LIMIT: number;
  JOB_QUEUE_SIZE_LIMIT: number;
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
      STACKS_NODE_RPC_HOST: {
        type: 'string',
      },
      STACKS_NODE_RPC_PORT: {
        type: 'number',
        minimum: 0,
        maximum: 65535,
      },
      METADATA_STRICT_MODE: {
        type: 'boolean',
        default: true,
      },
      METADATA_MAX_RETRIES: {
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
      JOB_QUEUE_CONCURRENCY_LIMIT: {
        type: 'number',
        default: 5,
      },
      JOB_QUEUE_SIZE_LIMIT: {
        type: 'number',
        default: 200,
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
