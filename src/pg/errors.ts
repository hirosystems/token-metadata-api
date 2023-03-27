export class TokenNotFoundError extends Error {
  constructor() {
    super();
    this.name = this.constructor.name;
  }
}

export class TokenNotProcessedError extends Error {
  constructor() {
    super();
    this.name = this.constructor.name;
  }
}

export class TokenLocaleNotFoundError extends Error {
  constructor() {
    super();
    this.name = this.constructor.name;
  }
}

export class InvalidContractError extends Error {
  constructor() {
    super();
    this.name = this.constructor.name;
  }
}

export class InvalidTokenError extends Error {
  constructor() {
    super();
    this.name = this.constructor.name;
  }
}
