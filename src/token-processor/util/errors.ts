/** Thrown when fetching metadata exceeds the max allowed byte size */
export class MetadataSizeExceededError extends Error {
  constructor() {
    super();
    this.message = 'Fetch size limit exceeded';
    this.name = this.constructor.name;
  }
}

/** Thrown when fetching metadata exceeds the max allowed timeout */
export class MetadataTimeoutError extends Error {
  constructor() {
    super();
    this.message = 'Time limit exceeded';
    this.name = this.constructor.name;
  }
}
