import { Value } from '@sinclair/typebox/value';
import { FastifyReply } from 'fastify';
import {
  InvalidTokenContractResponse,
  InvalidTokenMetadataResponse,
  ErrorResponse,
  TokenLocaleNotFoundResponse,
  TokenNotFoundResponse,
  TokenNotProcessedResponse,
  NotFoundResponse,
  ContractNotFoundResponse,
} from '../schemas';
import {
  ContractNotFoundError,
  InvalidContractError,
  InvalidTokenError,
  TokenLocaleNotFoundError,
  TokenNotFoundError,
  TokenNotProcessedError,
} from '../../pg/errors';
import { setReplyNonCacheable } from './cache';

export const TokenErrorResponseSchema = {
  404: NotFoundResponse,
  422: ErrorResponse,
};

export async function generateTokenErrorResponse(error: any, reply: FastifyReply) {
  setReplyNonCacheable(reply);
  if (error instanceof TokenNotFoundError) {
    await reply.code(404).send(Value.Create(TokenNotFoundResponse));
  } else if (error instanceof ContractNotFoundError) {
    await reply.code(404).send(Value.Create(ContractNotFoundResponse));
  } else if (error instanceof TokenNotProcessedError) {
    await reply.code(422).send(Value.Create(TokenNotProcessedResponse));
  } else if (error instanceof TokenLocaleNotFoundError) {
    await reply.code(422).send(Value.Create(TokenLocaleNotFoundResponse));
  } else if (error instanceof InvalidContractError) {
    await reply.code(422).send(Value.Create(InvalidTokenContractResponse));
  } else if (error instanceof InvalidTokenError) {
    await reply.code(422).send(Value.Create(InvalidTokenMetadataResponse));
  } else {
    throw error;
  }
}
