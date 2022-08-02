# Stacks Token Metadata Service

A microservice that indexes metadata for every single Fungible and Non-Fungible Token in the Stacks
blockchain and exposes it via REST API endpoints.

See the [Token Metadata Service API Reference]() for more information.

## Running the service

### System requirements

Before you start, you'll need to have access to:

* A fully synchronized [Stacks node](https://github.com/stacks-network/stacks-blockchain)
* A fully synchronized instance of the [Stacks Blockchain
API](https://github.com/hirosystems/stacks-blockchain-api) running in `default` or `write-only`
mode, with its Postgres database exposed for new connections
* A local Postgres database for token metadata storage

### Quick start

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