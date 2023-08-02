import { Static, Type } from '@sinclair/typebox';
import envSchema from 'env-schema';

const schema = Type.Object({
  /**
   * Run mode for this service. Allows you to control how the Token Metadata Service runs, typically
   * in an auto-scaled environment. Available values are:
   * * `default`: Runs background jobs and the REST API server (this is the default)
   * * `writeonly`: Runs only background jobs
   * * `readonly`: Runs only the REST API server
   */
  RUN_MODE: Type.Enum(
    { default: 'default', readonly: 'readonly', writeonly: 'writeonly' },
    { default: 'default' }
  ),
  /** Hosname of the Token Metadata API server */
  API_HOST: Type.String({ default: '0.0.0.0' }),
  /** Port in which to serve the API */
  API_PORT: Type.Number({ default: 3000, minimum: 0, maximum: 65535 }),
  /** Hostname from which to serve the Admin RPC interface */
  ADMIN_RPC_HOST: Type.String({ default: '0.0.0.0' }),
  /** Port in which to serve the Admin RPC interface */
  ADMIN_RPC_PORT: Type.Number({ default: 3001, minimum: 0, maximum: 65535 }),
  /** Port in which to receive chainhook events */
  EVENT_PORT: Type.Number({ default: 3099, minimum: 0, maximum: 65535 }),
  /** Hostname that will be reported to the chainhook node so it can call us back with events */
  EXTERNAL_HOSTNAME: Type.String({ default: '127.0.0.1' }),

  /** Hostname of the chainhook node we'll use to register predicates */
  CHAINHOOK_NODE_RPC_HOST: Type.String({ default: '127.0.0.1' }),
  /** Control port of the chainhook node */
  CHAINHOOK_NODE_RPC_PORT: Type.Number({ default: 20456, minimum: 0, maximum: 65535 }),
  /**
   * Authorization token that the chainhook node must send with every event to make sure it's
   * coming from the valid instance
   */
  CHAINHOOK_NODE_AUTH_TOKEN: Type.String(),

  PGHOST: Type.String(),
  PGPORT: Type.Number({ default: 5432, minimum: 0, maximum: 65535 }),
  PGUSER: Type.String(),
  PGPASSWORD: Type.String(),
  PGDATABASE: Type.String(),
  /** Limit to how many concurrent connections can be created */
  PG_CONNECTION_POOL_MAX: Type.Number({ default: 10 }),
  PG_IDLE_TIMEOUT: Type.Number({ default: 30 }),
  PG_MAX_LIFETIME: Type.Number({ default: 60 }),

  BLOCKCHAIN_API_PGHOST: Type.String(),
  BLOCKCHAIN_API_PGPORT: Type.Number({ default: 5432, minimum: 0, maximum: 65535 }),
  BLOCKCHAIN_API_PGUSER: Type.String(),
  BLOCKCHAIN_API_PGPASSWORD: Type.String(),
  BLOCKCHAIN_API_PGDATABASE: Type.String(),
  BLOCKCHAIN_API_PG_CONNECTION_POOL_MAX: Type.Number({ default: 10 }),
  BLOCKCHAIN_API_PG_IDLE_TIMEOUT: Type.Number({ default: 30 }),
  BLOCKCHAIN_API_PG_MAX_LIFETIME: Type.Number({ default: 60 }),

  STACKS_NODE_RPC_HOST: Type.String(),
  STACKS_NODE_RPC_PORT: Type.Number({ minimum: 0, maximum: 65535 }),

  /** Whether or not the `JobQueue` will continue to try retryable failed jobs indefinitely. */
  JOB_QUEUE_STRICT_MODE: Type.Boolean({ default: false }),
  /**
   * How many times a job will be retried if its failure is recoverable. This setting is ignored if
   * `JOB_QUEUE_STRICT_MODE` is enabled.
   */
  JOB_QUEUE_MAX_RETRIES: Type.Number({ default: 10 }),
  /** How many jobs will be processed at the same time in the `JobQueue`. */
  JOB_QUEUE_CONCURRENCY_LIMIT: Type.Number({ default: 5 }),
  /**
   * The maximum number of jobs that will be loaded into memory when fetching them from the
   * database.
   */
  JOB_QUEUE_SIZE_LIMIT: Type.Number({ default: 200 }),

  /**
   * The max number of immediate attempts that will be made to retrieve metadata from external URIs
   * before declaring the failure as a non-retryable error.
   */
  METADATA_MAX_IMMEDIATE_URI_RETRIES: Type.Number({ default: 3 }),
  /**
   * Timeout period for a token metadata URL fetch in milliseconds. You should not make this
   * timeout very short as usually IPFS and other gateways take a few seconds to respond with the
   * requested resource. Defaults to 30 seconds.
   */
  METADATA_FETCH_TIMEOUT_MS: Type.Number({ default: 30_000 }),
  /**
   * The maximum number of bytes of metadata to fetch. If the fetch encounters more bytes than this
   * limit it throws and the metadata is not processed.
   */
  METADATA_MAX_PAYLOAD_BYTE_SIZE: Type.Number({ default: 1_000_000 }), // 1 MB
  /**
   * Upper limit on the number of NFTs a contract may declare. Tune this number to guard against
   * test contracts that may define a ridiculous amount of tokens which could cause a denial of
   * service in our token queue. Defaults to 50,000.
   */
  METADATA_MAX_NFT_CONTRACT_TOKEN_COUNT: Type.Number({ default: 50_000 }),
  /**
   * Configure a script to handle image URLs during token metadata processing. Must be an executable
   * script that accepts the URL as the first program argument and outputs a result URL to stdout.
   * Example: ./config/image-cache.js
   */
  METADATA_IMAGE_CACHE_PROCESSOR: Type.Optional(Type.String()),
  /**
   * How often will token metadata that is marked `dynamic` will be refreshed if it doesn't specify
   * an explicit TTL (seconds). See SIP-019 for more information. Defaults to 86400 seconds (24
   * hours).
   */
  METADATA_DYNAMIC_TOKEN_REFRESH_INTERVAL: Type.Number({ default: 86_400 }), // 24 hours
  /**
   * Time that must elapse between a 429 'Too many requests' response returned by a hostname and the
   * next request that is sent to it (seconds). This value will be overridden by the `Retry-After`
   * header returned by the domain, if any.
   */
  METADATA_RATE_LIMITED_HOST_RETRY_AFTER: Type.Number({ default: 3600 }), // 1 hour
  /**
   * Maximum number of HTTP redirections to follow when fetching metadata. Defaults to 5.
   */
  METADATA_FETCH_MAX_REDIRECTIONS: Type.Number({ default: 5 }),

  /**
   * Base URL for a public gateway which will provide access to all IPFS resources. Defaults to
   * `https://cloudflare-ipfs.com`.
   */
  PUBLIC_GATEWAY_IPFS: Type.String({ default: 'https://cloudflare-ipfs.com' }),
  /**
   * Base URL for a public gateway which will provide access to all Arweave resources. Defaults to
   * `https://arweave.net`.
   */
  PUBLIC_GATEWAY_ARWEAVE: Type.String({ default: 'https://arweave.net' }),
});
type Env = Static<typeof schema>;

export const ENV = envSchema<Env>({
  schema: schema,
  dotenv: true,
});
