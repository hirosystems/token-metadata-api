import { default as createOpenApiClient, ClientOptions } from "openapi-fetch";
import type { paths } from "./generated/schema";

export function createClient(options?: ClientOptions) {
  return createOpenApiClient<paths>({ baseUrl: 'https://api.mainnet.hiro.so', ...options });
}

export * from 'openapi-fetch';
