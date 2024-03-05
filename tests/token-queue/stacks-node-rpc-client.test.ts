import {
  cvToHex,
  uintCV,
  getAddressFromPrivateKey,
  makeRandomPrivKey,
  TransactionVersion,
  noneCV,
} from '@stacks/transactions';
import { MockAgent, setGlobalDispatcher } from 'undici';
import { ENV } from '../../src/env';
import { RetryableJobError } from '../../src/token-processor/queue/errors';
import { StacksNodeRpcClient } from '../../src/token-processor/stacks-node/stacks-node-rpc-client';
import { HttpError, StacksNodeJsonParseError } from '../../src/token-processor/util/errors';

describe('StacksNodeRpcClient', () => {
  const nodeUrl = `http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`;
  const contractAddr = 'SP176ZMV706NZGDDX8VSQRGMB7QN33BBDVZ6BMNHD';
  const contractName = 'project-indigo-act1';
  const contractPrincipal = `${contractAddr}.${contractName}`;
  let client: StacksNodeRpcClient;

  beforeEach(() => {
    const randomPrivKey = makeRandomPrivKey();
    const senderAddress = getAddressFromPrivateKey(randomPrivKey.data, TransactionVersion.Mainnet);
    client = new StacksNodeRpcClient({
      contractPrincipal: contractPrincipal,
      senderAddress: senderAddress,
    });
  });

  test('node runtime errors get retried', async () => {
    const mockResponse = {
      okay: false,
      cause: 'Runtime(Foo(Bar))',
    };
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent
      .get(nodeUrl)
      .intercept({
        path: `/v2/contracts/call-read/${contractAddr}/${contractName}/get-token-uri`,
        method: 'POST',
      })
      .reply(200, mockResponse);
    setGlobalDispatcher(agent);

    await expect(client.readStringFromContract('get-token-uri', [])).rejects.toThrow(
      RetryableJobError
    );
  });

  test('other node errors fail immediately', async () => {
    const mockResponse = {
      okay: false,
      cause: 'Unchecked(Foo(Bar))',
    };
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent
      .get(nodeUrl)
      .intercept({
        path: `/v2/contracts/call-read/${contractAddr}/${contractName}/get-token-uri`,
        method: 'POST',
      })
      .reply(200, mockResponse);
    setGlobalDispatcher(agent);

    await expect(client.readStringFromContract('get-token-uri', [])).rejects.not.toThrow(
      RetryableJobError
    );
    await expect(client.readStringFromContract('get-token-uri', [])).rejects.toThrow();
  });

  test('http errors are thrown', async () => {
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent
      .get(nodeUrl)
      .intercept({
        path: `/v2/contracts/call-read/${contractAddr}/${contractName}/get-token-uri`,
        method: 'POST',
      })
      .reply(500, { message: 'Server Error' });
    setGlobalDispatcher(agent);

    try {
      await client.readStringFromContract('get-token-uri', []);
    } catch (error) {
      expect(error).toBeInstanceOf(RetryableJobError);
      const err = error as RetryableJobError;
      expect(err.cause).toBeInstanceOf(HttpError);
    }
  });

  test('json parse errors are thrown', async () => {
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent
      .get(nodeUrl)
      .intercept({
        path: `/v2/contracts/call-read/${contractAddr}/${contractName}/get-token-uri`,
        method: 'POST',
      })
      .reply(200, 'not parseable');
    setGlobalDispatcher(agent);

    try {
      await client.readStringFromContract('get-token-uri', []);
    } catch (error) {
      expect(error).toBeInstanceOf(RetryableJobError);
      const err = error as RetryableJobError;
      expect(err.cause).toBeInstanceOf(StacksNodeJsonParseError);
    }
  });

  test('clarity value parse errors are not retried', async () => {
    const mockResponse = {
      okay: true,
      result: cvToHex(uintCV(5)), // `get-token-uri` will fail because this is a `uint`
    };
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent
      .get(nodeUrl)
      .intercept({
        path: `/v2/contracts/call-read/${contractAddr}/${contractName}/get-token-uri`,
        method: 'POST',
      })
      .reply(200, mockResponse);
    setGlobalDispatcher(agent);

    await expect(client.readStringFromContract('get-token-uri', [])).rejects.toThrow(Error);
  });

  test('incorrect none uri strings are parsed as undefined', async () => {
    const mockResponse = {
      okay: true,
      result: cvToHex(noneCV()),
    };
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent
      .get(nodeUrl)
      .intercept({
        path: `/v2/contracts/call-read/${contractAddr}/${contractName}/get-token-uri`,
        method: 'POST',
      })
      .reply(200, mockResponse);
    setGlobalDispatcher(agent);

    await expect(client.readStringFromContract('get-token-uri', [])).resolves.toBeUndefined();
  });

  test('contract ABI is returned correctly', async () => {
    const mockResponse = {
      functions: [
        {
          name: 'airdrop',
          access: 'private',
          args: [
            {
              name: 'tid',
              type: 'uint128',
            },
          ],
          outputs: {
            type: 'bool',
          },
        },
      ],
      variables: [
        {
          name: 'AIRDROP_COUNT_PER_MEMBER',
          type: 'uint128',
          access: 'constant',
        },
      ],
      maps: [
        {
          name: 'map_claimed_member_note',
          key: 'uint128',
          value: 'bool',
        },
      ],
      fungible_tokens: [
        {
          name: 'MEME',
        },
      ],
      non_fungible_tokens: [],
      epoch: 'Epoch24',
      clarity_version: 'Clarity2',
    };
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent
      .get(nodeUrl)
      .intercept({
        path: `/v2/contracts/interface/${contractAddr}/${contractName}`,
        method: 'GET',
      })
      .reply(200, mockResponse);
    setGlobalDispatcher(agent);

    const abi = await client.readContractInterface();
    expect(abi).not.toBeUndefined();
    expect(abi?.fungible_tokens[0].name).toBe('MEME');
  });
});
