/**
 * An error caused by something within a `Job` that we can try to do again at a later time.
 **/
export class RetryableJobError extends Error {
  constructor(message: string) {
    super(message);
    this.message = message;
    this.name = this.constructor.name;
  }
}
