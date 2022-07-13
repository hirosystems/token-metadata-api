/**
 * A token metadata fetch/process error caused by something that we can try to do again later.
 */
 export class RetryableTokenMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.message = message;
    this.name = this.constructor.name;
  }
}
