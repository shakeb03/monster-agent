import { openai, MODELS } from './client';
import { OpenAIStream, StreamingTextResponse } from 'ai';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export async function createChatCompletion(
  messages: ChatMessage[],
  options: ChatCompletionOptions = {}
) {
  const {
    model = MODELS.GPT4,
    temperature = 0.7,
    maxTokens = 2000,
    stream = false,
  } = options;

  try {
    const response = await openai.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream,
    });

    if (stream) {
      return OpenAIStream(response as any);
    }

    return response;
  } catch (error) {
    console.error('Chat completion error:', error);
    throw new Error('Failed to create chat completion');
  }
}

export async function createStreamingChatCompletion(
  messages: ChatMessage[],
  options: Omit<ChatCompletionOptions, 'stream'> = {}
) {
  const stream = await createChatCompletion(messages, {
    ...options,
    stream: true,
  });

  return stream;
}

