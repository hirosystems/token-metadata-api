import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { FastifyReply } from 'fastify';
import {
  TokenLocaleNotFoundResponse,
  TokenNotFoundResponse,
  TokenNotProcessedResponse,
} from '../types';
import {
  TokenLocaleNotFoundError,
  TokenNotFoundError,
  TokenNotProcessedError,
} from '../../pg/errors';

export const TokenErrorResponseSchema = {
  404: TokenNotFoundResponse,
  422: Type.Union([TokenNotProcessedResponse, TokenLocaleNotFoundResponse]),
};

export async function generateTokenErrorResponse(error: any, reply: FastifyReply) {
  if (error instanceof TokenNotFoundError) {
    await reply.code(404).send(Value.Create(TokenNotFoundResponse));
  } else if (error instanceof TokenNotProcessedError) {
    await reply.code(422).send(Value.Create(TokenNotProcessedResponse));
  } else if (error instanceof TokenLocaleNotFoundError) {
    await reply.code(422).send(Value.Create(TokenLocaleNotFoundResponse));
  } else {
    throw error;
  }
}
