export class ApifyError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'ApifyError';
  }
}

export class ApifyTimeoutError extends ApifyError {
  constructor(actorId: string) {
    super(
      `Apify actor ${actorId} timed out`,
      'APIFY_TIMEOUT',
      408
    );
  }
}

export class ApifyRateLimitError extends ApifyError {
  constructor() {
    super(
      'Apify API rate limit exceeded',
      'APIFY_RATE_LIMIT',
      429
    );
  }
}

export class ApifyInvalidInputError extends ApifyError {
  constructor(message: string) {
    super(
      `Invalid input: ${message}`,
      'APIFY_INVALID_INPUT',
      400
    );
  }
}

export function handleApifyError(error: any): ApifyError {
  if (error instanceof ApifyError) {
    return error;
  }

  if (error.response) {
    const status = error.response.status;
    
    if (status === 408 || status === 504) {
      return new ApifyTimeoutError(error.actorId || 'unknown');
    }
    
    if (status === 429) {
      return new ApifyRateLimitError();
    }
    
    if (status === 400) {
      return new ApifyInvalidInputError(error.message);
    }
  }

  return new ApifyError(
    error.message || 'Unknown Apify error',
    'APIFY_UNKNOWN',
    500
  );
}

