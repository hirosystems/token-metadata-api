# Stacks Token Metadata Service

A microservice that indexes metadata for every single Fungible and Non-Fungible Token in the Stacks
blockchain and exposes it via REST API endpoints.

See the [Token Metadata Service API Reference]() for more information.

## Features

* Complete SIP-016 metadata ingestion for
    * SIP-009 Non-Fungible Tokens
    * SIP-010 Fungible Tokens
    * SIP-013 Semi-Fungible Tokens (coming soon!)
* Real-time metadata refreshing via SIP-019 notifications
* Metadata localization support
* Easy to use REST JSON endpoints with ETag caching

## Quick start

### System requirements

Before you start, you'll need to have access to:

* A fully synchronized [Stacks node](https://github.com/stacks-network/stacks-blockchain)
* A fully synchronized instance of the [Stacks Blockchain
API](https://github.com/hirosystems/stacks-blockchain-api) running in `default` or `write-only`
mode, with its Postgres database exposed for new connections
* A local Postgres database for token metadata storage

### Running the service

Copy the `.env.example` file into `.env`, and substitute the appropriate values to configure access
to the Stacks API database, the Token Metadata Service local database, and the Stacks node RPC
interface.

Build the app and apply local database migrations
```
npm install
npm run build
npm run migrate
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
