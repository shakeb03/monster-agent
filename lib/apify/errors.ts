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

type ApifyAPIError = {
  response?: {
    status?: number;
  };
  actorId?: string;
  message?: string;
};

function isApifyAPIError(error: unknown): error is ApifyAPIError {
  return typeof error === 'object' && error !== null;
}

export function handleApifyError(error: unknown): ApifyError {
  if (error instanceof ApifyError) {
    return error;
  }

  if (isApifyAPIError(error) && error.response) {
    const status = error.response.status;
    
    if (status === 408 || status === 504) {
      return new ApifyTimeoutError(error.actorId || 'unknown');
    }
    
    if (status === 429) {
      return new ApifyRateLimitError();
    }
    
    if (status === 400) {
      return new ApifyInvalidInputError(error.message || 'Invalid Apify input');
    }
  }

  const message = isApifyAPIError(error) ? error.message : undefined;

  return new ApifyError(
    message || 'Unknown Apify error',
    'APIFY_UNKNOWN',
    500
  );
}
