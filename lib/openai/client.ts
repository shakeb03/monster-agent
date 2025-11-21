import OpenAI from 'openai';

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export const MODELS = {
  GPT4: 'gpt-4',
  GPT4_TURBO: 'gpt-4-turbo-preview',
  GPT4O_MINI: 'gpt-4o-mini',
  EMBEDDING: 'text-embedding-3-small',
} as const;

export const TOKEN_LIMITS = {
  GPT4: 8192,
  GPT4_TURBO: 128000,
  GPT4O_MINI: 128000,
  CONTEXT_THRESHOLD: 200000,
} as const;

