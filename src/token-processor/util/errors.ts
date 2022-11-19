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

/** Thrown when there is a parse error that prevented metadata processing */
export class MetadataParseError extends Error {
  constructor(message: string) {
    super();
    this.message = message;
    this.name = this.constructor.name;
  }
}
