# Stacks Token Metadata Service

A microservice that indexes metadata for every single Fungible and Non-Fungible Token in the Stacks
blockchain and exposes it via REST API endpoints.

See the [Token Metadata Service API Reference]() for more information.

## Features

* Complete
  [SIP-016](https://github.com/stacksgov/sips/blob/main/sips/sip-016/sip-016-token-metadata.md)
  metadata ingestion for
    * [SIP-009](https://github.com/stacksgov/sips/blob/main/sips/sip-009/sip-009-nft-standard.md)
      Non-Fungible Tokens
    * [SIP-010](https://github.com/stacksgov/sips/blob/main/sips/sip-010/sip-010-fungible-token-standard.md)
      Fungible Tokens
    * [SIP-013](https://github.com/stacksgov/sips/pull/42) Semi-Fungible Tokens *(coming soon!)*
* Real-time metadata refreshing via [SIP-019](https://github.com/stacksgov/sips/pull/72)
  notifications
* Metadata localization support
* Metadata JSON fetching via `http:`, `https:`, `data:` URIs. Also supported:
    * IPFS
    * Arweave
* Easy to use REST JSON endpoints with ETag caching
* Prometheus metrics for job queue status, contract and token counts, API performance, etc.

## Quick start

### System requirements

Before you start, you'll need to have access to:

* A fully synchronized [Stacks node](https://github.com/stacks-network/stacks-blockchain)
* A fully synchronized instance of the [Stacks Blockchain
API](https://github.com/hirosystems/stacks-blockchain-api) running in `default` or `write-only`
mode, with its Postgres database exposed for new connections
* A local Postgres database for token metadata storage

### Running the service

Create an `.env` file and specify the appropriate values to configure access to the Stacks API
database, the Token Metadata Service local database, and the Stacks node RPC interface. See
[`env.ts`](https://github.com/hirosystems/token-metadata-service/blob/develop/src/env.ts) for
available options.

Build the app
```
npm install
npm run build
```

Start the service
```
npm run start
```

## Architecture

![Architecture](architecture.png)

The Stacks Token Metadata Service connects to three different systems to operate:

1. A Stacks Blockchain API database to import all historical smart contracts when booting up
1. A Stacks node to issue all read-only contract calls when refreshing metadata (to get token count,
   token URIs, etc.)
1. A local Postgres DB to store all processed metadata info

Additionally, the service will fetch external metadata files (JSONs, images) from the Internet.

### Internal components

* Smart Contract Importer

* Smart Contract Monitor

* Job Queue
