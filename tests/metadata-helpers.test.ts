import { MockAgent, setGlobalDispatcher } from "undici";
import { ENV } from "../src/env";
import { performSizeAndTimeLimitedMetadataFetch } from "../src/token-processor/util/metadata-helpers";

describe('Metadata Helpers', () => {
  test('performs timed and limited request', async () => {
    const url = new URL('http://test.io/1.json');

    const agent = new MockAgent();
    agent.disableNetConnect();
    agent.get('http://test.io')
      .intercept({
        path: '/1.json',
        method: 'GET'
      })
      .reply(200, 'hello');
    setGlobalDispatcher(agent);

    const result = await performSizeAndTimeLimitedMetadataFetch(url);
    expect(result).toBe('hello');
  });

  test('reject large responses', async () => {
    const yugeBuffer = Buffer.alloc(ENV.METADATA_MAX_PAYLOAD_BYTE_SIZE + 100);
    const url = new URL('http://test.io/1.json');

    const agent = new MockAgent();
    agent.disableNetConnect();
    agent.get('http://test.io')
      .intercept({
        path: '/1.json',
        method: 'GET'
      })
      .reply(200, yugeBuffer);
    setGlobalDispatcher(agent);

    await expect(performSizeAndTimeLimitedMetadataFetch(url))
      .rejects.toThrow(/Fetch size limit exceeded/);
  });

  test('reject timed out requests', async () => {
    const prevTimeout = ENV.METADATA_FETCH_TIMEOUT_MS;
    ENV.METADATA_FETCH_TIMEOUT_MS = 100;
    const url = new URL('http://test.io/1.json');

    const agent = new MockAgent();
    agent.disableNetConnect();
    agent.get('http://test.io')
      .intercept({
        path: '/1.json',
        method: 'GET'
      })
      .reply(200, '')
      .delay(150);
    setGlobalDispatcher(agent);

    await expect(performSizeAndTimeLimitedMetadataFetch(url))
      .rejects.toThrow(/Time limit exceeded/);
    ENV.METADATA_FETCH_TIMEOUT_MS = prevTimeout;
  });
});
