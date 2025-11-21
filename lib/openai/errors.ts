export class OpenAIError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'OpenAIError';
  }
}

export class OpenAIRateLimitError extends OpenAIError {
  constructor() {
    super('OpenAI API rate limit exceeded', 'OPENAI_RATE_LIMIT', 429);
  }
}

export class OpenAIInvalidRequestError extends OpenAIError {
  constructor(message: string) {
    super(message, 'OPENAI_INVALID_REQUEST', 400);
  }
}

export class OpenAIAuthenticationError extends OpenAIError {
  constructor() {
    super('OpenAI API authentication failed', 'OPENAI_AUTH_FAILED', 401);
  }
}

export function handleOpenAIError(error: any): OpenAIError {
  if (error instanceof OpenAIError) {
    return error;
  }

  if (error.status === 429) {
    return new OpenAIRateLimitError();
  }

  if (error.status === 401) {
    return new OpenAIAuthenticationError();
  }

  if (error.status === 400) {
    return new OpenAIInvalidRequestError(
      error.message || 'Invalid request to OpenAI'
    );
  }

  return new OpenAIError(
    error.message || 'Unknown OpenAI error',
    'OPENAI_UNKNOWN',
    error.status || 500
  );
}

