import { ClarityAbi, ClarityAbiFunction } from '@stacks/transactions';
import { DbSipNumber } from '../../pg/types';

const FT_FUNCTIONS: ClarityAbiFunction[] = [
  {
    access: 'public',
    args: [
      { type: 'uint128', name: 'amount' },
      { type: 'principal', name: 'sender' },
      { type: 'principal', name: 'recipient' },
      { type: { optional: { buffer: { length: 34 } } }, name: 'memo' },
    ],
    name: 'transfer',
    outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
  },
  {
    access: 'read_only',
    args: [],
    name: 'get-name',
    outputs: { type: { response: { ok: { 'string-ascii': { length: 32 } }, error: 'uint128' } } },
  },
  {
    access: 'read_only',
    args: [],
    name: 'get-symbol',
    outputs: { type: { response: { ok: { 'string-ascii': { length: 32 } }, error: 'uint128' } } },
  },
  {
    access: 'read_only',
    args: [],
    name: 'get-decimals',
    outputs: { type: { response: { ok: 'uint128', error: 'uint128' } } },
  },
  {
    access: 'read_only',
    args: [{ type: 'principal', name: 'address' }],
    name: 'get-balance',
    outputs: { type: { response: { ok: 'uint128', error: 'uint128' } } },
  },
  {
    access: 'read_only',
    args: [],
    name: 'get-total-supply',
    outputs: { type: { response: { ok: 'uint128', error: 'uint128' } } },
  },
  {
    access: 'read_only',
    args: [],
    name: 'get-token-uri',
    outputs: {
      type: {
        response: {
          ok: {
            optional: { 'string-ascii': { length: 256 } },
          },
          error: 'uint128',
        },
      },
    },
  },
];

const NFT_FUNCTIONS: ClarityAbiFunction[] = [
  {
    access: 'read_only',
    args: [],
    name: 'get-last-token-id',
    outputs: {
      type: {
        response: {
          ok: 'uint128',
          error: 'uint128',
        },
      },
    },
  },
  {
    access: 'read_only',
    args: [{ name: 'any', type: 'uint128' }],
    name: 'get-token-uri',
    outputs: {
      type: {
        response: {
          ok: {
            optional: { 'string-ascii': { length: 256 } },
          },
          error: 'uint128',
        },
      },
    },
  },
  {
    access: 'read_only',
    args: [{ type: 'uint128', name: 'any' }],
    name: 'get-owner',
    outputs: {
      type: {
        response: {
          ok: {
            optional: 'principal',
          },
          error: 'uint128',
        },
      },
    },
  },
  {
    access: 'public',
    args: [
      { type: 'uint128', name: 'id' },
      { type: 'principal', name: 'sender' },
      { type: 'principal', name: 'recipient' },
    ],
    name: 'transfer',
    outputs: {
      type: {
        response: {
          ok: 'bool',
          error: {
            tuple: [
              { type: { 'string-ascii': { length: 32 } }, name: 'kind' },
              { type: 'uint128', name: 'code' },
            ],
          },
        },
      },
    },
  },
];

const SFT_FUNCTIONS: ClarityAbiFunction[] = [
  {
    name: 'get-balance',
    access: 'read_only',
    args: [
      { type: 'uint128', name: 'token-id' },
      { type: 'principal', name: 'address' }
    ],
    outputs: { type: { response: { ok: 'uint128', error: 'uint128' } } },
  },
  {
    name: 'get-overall-balance',
    access: 'read_only',
    args: [
      { type: 'principal', name: 'address' }
    ],
    outputs: { type: { response: { ok: 'uint128', error: 'uint128' } } },
  },
  {
    name: 'get-total-supply',
    access: 'read_only',
    args: [
      { type: 'uint128', name: 'token-id' }
    ],
    outputs: { type: { response: { ok: 'uint128', error: 'uint128' } } },
  },
  {
    name: 'get-overall-supply',
    access: 'read_only',
    args: [],
    outputs: { type: { response: { ok: 'uint128', error: 'uint128' } } },
  },
  {
    name: 'get-decimals',
    access: 'read_only',
    args: [
      { type: 'uint128', name: 'token-id' }
    ],
    outputs: { type: { response: { ok: 'uint128', error: 'uint128' } } },
  },
  {
    name: 'get-token-uri',
    access: 'read_only',
    args: [
      { type: 'uint128', name: 'token-id' }
    ],
    outputs: {
      type: {
        response: {
          ok: {
            optional: { 'string-ascii': { length: 256 } },
          },
          error: 'uint128',
        },
      },
    },
  },
  {
    name: 'transfer',
    access: 'public',
    args: [
      { type: 'uint128', name: 'token-id' },
      { type: 'uint128', name: 'amount' },
      { type: 'principal', name: 'sender' },
      { type: 'principal', name: 'recipient' },
    ],
    outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
  },
  {
    name: 'transfer-memo',
    access: 'public',
    args: [
      { type: 'uint128', name: 'token-id' },
      { type: 'uint128', name: 'amount' },
      { type: 'principal', name: 'sender' },
      { type: 'principal', name: 'recipient' },
      { type: { buffer: { length: 34 } }, name: 'memo' },
    ],
    outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
  }
];

/**
 * Detects which token SIP the given contract conforms to, if any.
 * @param abi Contract abi
 * @returns SIP or false
 */
export function getSmartContractSip(abi: ClarityAbi): DbSipNumber | false {
  // TODO: Will stacks.js support SFTs?
  if (abiContains(abi, SFT_FUNCTIONS)) {
    return DbSipNumber.sip013;
  }
  if (abi.non_fungible_tokens.length > 0 && abiContains(abi, NFT_FUNCTIONS)) {
    return DbSipNumber.sip009;
  }
  if (abi.fungible_tokens.length > 0 && abiContains(abi, FT_FUNCTIONS)) {
    return DbSipNumber.sip010;
  }
  return false;
}

/**
 * This method check if the contract is compliance with sip-09 and sip-10
 * Ref: https://github.com/stacksgov/sips/tree/main/sips
 */
function abiContains(abi: ClarityAbi, standardFunction: ClarityAbiFunction[]): boolean {
  return standardFunction.every(abiFun => findFunction(abiFun, abi.functions));
}

/**
 * check if the fun  exist in the function list
 * @param fun - function to be found
 * @param functionList - list of functions
 * @returns - true if function is in the list false otherwise
 */
function findFunction(fun: ClarityAbiFunction, functionList: ClarityAbiFunction[]): boolean {
  const found = functionList.find(standardFunction => {
    if (standardFunction.name !== fun.name || standardFunction.args.length !== fun.args.length)
      return false;
    for (let i = 0; i < fun.args.length; i++) {
      if (standardFunction.args[i].type.toString() !== fun.args[i].type.toString()) {
        return false;
      }
    }
    return true;
  });
  return found !== undefined;
}
