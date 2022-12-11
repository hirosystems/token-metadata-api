# Stacks Token Metadata Service

A microservice that indexes metadata for every single Fungible and Non-Fungible Token in the Stacks
blockchain and exposes it via REST API endpoints.

## Table of Contents

* [Features](#features)
* [API reference](#api-reference)
* [Quick start](#quick-start)
    * [System requirements](#system-requirements)
    * [Running the service](#running-the-service)
* [Service architecture](#service-architecture)
    * [External](#external)
    * [Internal](#internal)
        * [Blockchain importer](#smart-contract-importer)
        * [Smart Contract Monitor](#smart-contract-monitor)
        * [Job Queue](#job-queue)

## Features

* Complete
  [SIP-016](https://github.com/stacksgov/sips/blob/main/sips/sip-016/sip-016-token-metadata.md)
  metadata ingestion for
    * [SIP-009](https://github.com/stacksgov/sips/blob/main/sips/sip-009/sip-009-nft-standard.md)
      Non-Fungible Tokens
    * [SIP-010](https://github.com/stacksgov/sips/blob/main/sips/sip-010/sip-010-fungible-token-standard.md)
      Fungible Tokens
    * [SIP-013](https://github.com/stacksgov/sips/pull/42) Semi-Fungible Tokens *(coming soon!)*
* Metadata refreshing via [SIP-019](https://github.com/stacksgov/sips/pull/72)
  notifications
* Metadata localization support
* Metadata JSON fetching via `http:`, `https:`, `data:` URIs. Also supported:
    * IPFS
    * Arweave
* Easy to use REST JSON endpoints with ETag caching
* Prometheus metrics for job queue status, contract and token counts, API performance, etc.

## API reference

See the [Token Metadata Service API Reference]() for more information.

## Quick start

### System requirements

The Token Metadata Service is a microservice that has hard dependencies on other Stacks components.
Before you start, you'll need to have access to:

* A fully synchronized [Stacks node](https://github.com/stacks-network/stacks-blockchain)
* A fully synchronized instance of the [Stacks Blockchain
API](https://github.com/hirosystems/stacks-blockchain-api) running in `default` or `write-only`
mode, with its Postgres database exposed for new connections. A read-only replica is acceptable.
* A local writeable Postgres database for token metadata storage

### Running the service

Clone the repo.

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

## Service architecture

### External

![Architecture](architecture.png)

The Stacks Token Metadata Service connects to three different systems to operate:

1. A Stacks Blockchain API database to import all historical smart contracts when booting up and to
   listen for new contracts that may be deployed. Only read access is required, this service will
   never need to write anything to this DB.
1. A Stacks node to issue all read-only contract calls when refreshing metadata (to get token count,
   token URIs, etc.)
1. A local Postgres DB to store all processed metadata info

The service will also need to fetch external metadata files (JSONs, images) from the Internet, so it
should have access to external networks.

### Internal

#### Blockchain importer

The
[`BlockchainImporter`](https://github.com/hirosystems/token-metadata-service/blob/develop/src/token-processor/blockchain-api/blockchain-importer.ts)
component is only used on service bootup.

It connects to the Stacks Blockchain API database and scans the entire `smart_contracts` table
looking for any contract that conforms to SIP-009, SIP-010 or SIP-013. When it finds a token
contract, it creates a
[`ProcessSmartContractJob`](https://github.com/hirosystems/token-metadata-service/blob/develop/src/token-processor/process-smart-contract-job.ts)
job and adds it to the [Job queue](#job-queue) so its tokens can be read and processed thereafter.

This process is only run once. If the Token Metadata Service is ever restarted, though, this
component re-scans the API `smart_contracts` table from the last processed block height so it can
pick up any newer contracts it might have missed while the service was unavailable.

#### Smart Contract Monitor

#### Job Queue
