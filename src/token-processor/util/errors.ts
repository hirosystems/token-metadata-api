/** Thrown when fetching metadata exceeds the max allowed byte size */
export class MetadataSizeExceededError extends Error {
  constructor(message: string) {
    super();
    this.message = message;
    this.name = this.constructor.name;
  }
}

/** Thrown when fetching metadata exceeds the max allowed timeout */
export class MetadataTimeoutError extends Error {
  constructor(message: string) {
    super();
    this.message = message;
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

export class HttpError extends Error {
  public cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super();
    this.message = message;
    this.name = this.constructor.name;
    this.cause = cause;
  }
}

export class TooManyRequestsHttpError extends HttpError {
  public url: URL;
  public retryAfter?: number;
  constructor(url: URL, retryAfter?: number) {
    super(url.toString());
    this.name = this.constructor.name;
    this.url = url;
    this.retryAfter = retryAfter;
  }
}

export class JsonParseError extends Error {
  constructor(message: string) {
    super();
    this.message = message;
    this.name = this.constructor.name;
  }
}
