/**
 * An error caused by something within a `Job` that we can try to do again at a later time.
 **/
export class RetryableJobError extends Error {
  public cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.message = message;
    this.name = this.constructor.name;
    this.cause = cause;
  }
}
