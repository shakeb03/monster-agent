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

type OpenAIAPIError = {
  status?: number;
  message?: string;
};

function isOpenAIAPIError(error: unknown): error is OpenAIAPIError {
  return typeof error === 'object' && error !== null;
}

export function handleOpenAIError(error: unknown): OpenAIError {
  if (error instanceof OpenAIError) {
    return error;
  }

  if (isOpenAIAPIError(error) && error.status === 429) {
    return new OpenAIRateLimitError();
  }

  if (isOpenAIAPIError(error) && error.status === 401) {
    return new OpenAIAuthenticationError();
  }

  if (isOpenAIAPIError(error) && error.status === 400) {
    return new OpenAIInvalidRequestError(
      error.message || 'Invalid request to OpenAI'
    );
  }

  const message = isOpenAIAPIError(error) ? error.message : undefined;

  return new OpenAIError(
    message || 'Unknown OpenAI error',
    'OPENAI_UNKNOWN',
    isOpenAIAPIError(error) ? error.status || 500 : 500
  );
}
