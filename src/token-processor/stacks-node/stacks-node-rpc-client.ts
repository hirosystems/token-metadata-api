import { request, errors } from 'undici';
import { ClarityType, ClarityValue, cvToHex, hexToCV, UIntCV } from '@stacks/transactions';
import { ENV } from '../../env';
import { RetryableJobError } from '../queue/errors';
import { HttpError, JsonParseError } from '../util/errors';

interface ReadOnlyContractCallSuccessResponse {
  okay: true;
  result: string;
}

interface ReadOnlyContractCallFailResponse {
  okay: false;
  cause: string;
}

export type ReadOnlyContractCallResponse =
  | ReadOnlyContractCallSuccessResponse
  | ReadOnlyContractCallFailResponse;

/**
 * Performs read-only contract calls against a configured Stacks node. Performs type checking and
 * returns data as decoded Clarity values.
 */
export class StacksNodeRpcClient {
  private readonly contractAddress: string;
  private readonly contractName: string;
  private readonly senderAddress: string;
  private readonly basePath: string;

  constructor(args: { contractPrincipal: string; senderAddress: string }) {
    [this.contractAddress, this.contractName] = args.contractPrincipal.split('.');
    this.senderAddress = args.senderAddress;
    this.basePath = `http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`;
  }

  async readStringFromContract(
    functionName: string,
    functionArgs: ClarityValue[] = []
  ): Promise<string | undefined> {
    const clarityValue = await this.makeReadOnlyContractCall(functionName, functionArgs);
    return this.checkAndParseString(clarityValue);
  }

  async readUIntFromContract(
    functionName: string,
    functionArgs: ClarityValue[] = []
  ): Promise<bigint | undefined> {
    const clarityValue = await this.makeReadOnlyContractCall(functionName, functionArgs);
    const uintVal = this.checkAndParseUintCV(clarityValue);
    try {
      return BigInt(uintVal.value.toString());
    } catch (error) {
      throw new RetryableJobError(`Invalid uint value '${uintVal.value}'`);
    }
  }

  private async sendReadOnlyContractCall(
    functionName: string,
    functionArgs: ClarityValue[]
  ): Promise<ReadOnlyContractCallResponse> {
    const body = {
      sender: this.senderAddress,
      arguments: functionArgs.map(arg => cvToHex(arg)),
    };
    const url = `${this.basePath}/v2/contracts/call-read/${this.contractAddress}/${this.contractName}/${functionName}`;
    try {
      const result = await request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        throwOnError: true,
      });
      const text = (await result.body.text()) as string;
      try {
        return JSON.parse(text) as ReadOnlyContractCallResponse;
      } catch (error) {
        throw new JsonParseError(`JSON parse error ${url}: ${text}`);
      }
    } catch (error) {
      if (error instanceof errors.UndiciError) {
        throw new HttpError(url, error);
      }
      throw error;
    }
  }

  private async makeReadOnlyContractCall(
    functionName: string,
    functionArgs: ClarityValue[]
  ): Promise<ClarityValue> {
    let result: ReadOnlyContractCallResponse;
    try {
      result = await this.sendReadOnlyContractCall(functionName, functionArgs);
    } catch (error) {
      throw new RetryableJobError(`Error making read-only contract call`, error);
    }
    if (!result.okay) {
      // Only runtime errors reported by the Stacks node should be retryable.
      if (result.cause.startsWith('Runtime')) {
        throw new RetryableJobError(
          `Runtime error while calling read-only function ${functionName}`
        );
      }
      throw new Error(`Read-only error ${functionName}: ${result.cause}`);
    }
    return hexToCV(result.result);
  }

  private unwrapClarityType(clarityValue: ClarityValue): ClarityValue {
    let unwrappedClarityValue: ClarityValue = clarityValue;
    while (
      unwrappedClarityValue.type === ClarityType.ResponseOk ||
      unwrappedClarityValue.type === ClarityType.OptionalSome
    ) {
      unwrappedClarityValue = unwrappedClarityValue.value;
    }
    return unwrappedClarityValue;
  }

  private checkAndParseUintCV(responseCV: ClarityValue): UIntCV {
    const unwrappedClarityValue = this.unwrapClarityType(responseCV);
    if (unwrappedClarityValue.type === ClarityType.UInt) {
      return unwrappedClarityValue;
    }
    throw new RetryableJobError(
      `Unexpected Clarity type '${unwrappedClarityValue.type}' while unwrapping uint`
    );
  }

  private checkAndParseString(responseCV: ClarityValue): string | undefined {
    const unwrappedClarityValue = this.unwrapClarityType(responseCV);
    if (
      unwrappedClarityValue.type === ClarityType.StringASCII ||
      unwrappedClarityValue.type === ClarityType.StringUTF8
    ) {
      return unwrappedClarityValue.data;
    } else if (unwrappedClarityValue.type === ClarityType.OptionalNone) {
      return undefined;
    }
    throw new RetryableJobError(
      `Unexpected Clarity type '${unwrappedClarityValue.type}' while unwrapping string`
    );
  }
}
