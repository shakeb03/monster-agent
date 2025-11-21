# 04-OPENAI-INTEGRATION.md - OpenAI Integration

## Step 1: Create OpenAI Client

Create `lib/openai/client.ts`:

```typescript
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
```

## Step 2: Create Embeddings Utility

Create `lib/openai/embeddings.ts`:

```typescript
import { openai, MODELS } from './client';

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: MODELS.EMBEDDING,
      input: text,
      encoding_format: 'float',
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw new Error('Failed to generate embedding');
  }
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    const response = await openai.embeddings.create({
      model: MODELS.EMBEDDING,
      input: texts,
      encoding_format: 'float',
    });

    return response.data.map((d) => d.embedding);
  } catch (error) {
    console.error('Error generating embeddings:', error);
    throw new Error('Failed to generate embeddings');
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

## Step 3: Create Token Counter

Create `lib/openai/tokens.ts`:

```typescript
export function estimateTokenCount(text: string): number {
  // Rough estimation: ~4 characters per token
  return Math.ceil(text.length / 4);
}

export function estimateTokensFromMessages(
  messages: Array<{ role: string; content: string }>
): number {
  let totalTokens = 0;

  for (const message of messages) {
    // Each message has overhead: role (1 token) + content + formatting (~3 tokens)
    totalTokens += 4;
    totalTokens += estimateTokenCount(message.content);
  }

  // Additional overhead for the message array
  totalTokens += 3;

  return totalTokens;
}

export function shouldSummarizeBasedOnTokens(tokenCount: number): boolean {
  return tokenCount >= 180000; // 180k tokens, leaving buffer before 200k limit
}
```

## Step 4: Create Chat Completion Utilities

Create `lib/openai/chat.ts`:

```typescript
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
```

## Step 5: Create Analysis Utilities

Create `lib/openai/analysis.ts`:

```typescript
import { openai, MODELS } from './client';

interface PostAnalysisResult {
  tone: string;
  topics: string[];
  hook_analysis: string;
  engagement_analysis: string;
  what_worked: string;
  what_didnt_work: string;
  posting_time: string;
}

interface VoiceAnalysisResult {
  overall_tone: string;
  writing_style: string;
  common_topics: string[];
  posting_patterns: {
    frequency: string;
    best_times: string[];
    post_length: string;
  };
  engagement_patterns: {
    high_performers: string;
    low_performers: string;
  };
  strengths: string[];
  weaknesses: string[];
  top_performing_elements: string[];
  recommendations: string[];
  analysis_summary: string;
}

export async function analyzePost(
  postText: string,
  metrics: {
    likesCount: number;
    commentsCount: number;
    sharesCount: number;
    engagementRate: number | null;
  }
): Promise<PostAnalysisResult> {
  const prompt = `Analyze this LinkedIn post and provide detailed insights:

Post Text: ${postText}
Likes: ${metrics.likesCount}
Comments: ${metrics.commentsCount}
Shares: ${metrics.sharesCount}
Engagement Rate: ${metrics.engagementRate}%

Provide analysis in the following JSON format:
{
  "tone": "professional/casual/inspirational/educational/etc",
  "topics": ["topic1", "topic2", "topic3"],
  "hook_analysis": "Analysis of the opening hook and its effectiveness",
  "engagement_analysis": "Why this post did or didn't perform well",
  "what_worked": "Specific elements that contributed to success",
  "what_didnt_work": "Areas for improvement",
  "posting_time": "HH:MM format of when posted"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: MODELS.GPT4O_MINI,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert LinkedIn content analyst. Provide detailed, actionable insights in JSON format.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0].message.content || '{}';
    return JSON.parse(content);
  } catch (error) {
    console.error('Post analysis error:', error);
    throw new Error('Failed to analyze post');
  }
}

export async function analyzeVoice(
  posts: Array<{
    text: string;
    engagementRate: number | null;
  }>
): Promise<VoiceAnalysisResult> {
  const postsText = posts
    .slice(0, 20)
    .map((p, i) => `Post ${i + 1}: ${p.text}\nEngagement: ${p.engagementRate}%`)
    .join('\n\n');

  const prompt = `Based on these ${posts.length} LinkedIn posts, create a comprehensive voice and style profile:

${postsText}

Provide analysis in the following JSON format:
{
  "overall_tone": "Description of overall tone",
  "writing_style": "Description of writing style and patterns",
  "common_topics": ["topic1", "topic2", "topic3"],
  "posting_patterns": {
    "frequency": "Description",
    "best_times": ["time1", "time2"],
    "post_length": "Short/Medium/Long"
  },
  "engagement_patterns": {
    "high_performers": "What drives high engagement",
    "low_performers": "What hurts engagement"
  },
  "strengths": ["strength1", "strength2", "strength3"],
  "weaknesses": ["weakness1", "weakness2"],
  "top_performing_elements": ["element1", "element2", "element3"],
  "recommendations": ["rec1", "rec2", "rec3"],
  "analysis_summary": "2-3 sentence summary of their LinkedIn voice"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: MODELS.GPT4O_MINI,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert LinkedIn content strategist. Create a detailed voice profile.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0].message.content || '{}';
    return JSON.parse(content);
  } catch (error) {
    console.error('Voice analysis error:', error);
    throw new Error('Failed to analyze voice');
  }
}
```

## Step 6: Create Summarization Utilities

Create `lib/openai/summarize.ts`:

```typescript
import { openai, MODELS } from './client';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export async function summarizeConversation(
  messages: Message[]
): Promise<string> {
  const conversationText = messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  const prompt = `Summarize the following conversation concisely, preserving key points, decisions, and context that would be important for future interactions:

${conversationText}

Provide a comprehensive summary that captures:
1. Main topics discussed
2. User's goals and preferences
3. Key decisions or conclusions
4. Important context for future conversations`;

  try {
    const response = await openai.chat.completions.create({
      model: MODELS.GPT4O_MINI,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert at summarizing conversations while preserving important context.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });

    return response.choices[0].message.content || '';
  } catch (error) {
    console.error('Summarization error:', error);
    throw new Error('Failed to summarize conversation');
  }
}

export async function summarizeLongContext(
  contextText: string
): Promise<string> {
  const prompt = `Condense the following context while preserving all critical information, user preferences, goals, and important details:

${contextText}

Create a comprehensive but concise summary that maintains the essential information needed for personalized assistance.`;

  try {
    const response = await openai.chat.completions.create({
      model: MODELS.GPT4O_MINI,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert at condensing long context while preserving critical information.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.2,
      max_tokens: 2000,
    });

    return response.choices[0].message.content || '';
  } catch (error) {
    console.error('Context summarization error:', error);
    throw new Error('Failed to summarize context');
  }
}
```

## Step 7: Create System Prompt Builder

Create `lib/openai/prompts.ts`:

```typescript
interface UserProfile {
  fullName: string | null;
  headline: string | null;
  about: string | null;
  goals: string[];
}

interface VoiceProfile {
  overallTone: string | null;
  writingStyle: string | null;
  commonTopics: string[];
  analysisSummary: string | null;
}

export function buildSystemPrompt(
  userProfile: UserProfile,
  voiceProfile: VoiceProfile,
  chatType: 'standard' | 'new_perspective'
): string {
  const basePrompt = `You are an expert LinkedIn content strategist helping ${userProfile.fullName || 'the user'} create engaging LinkedIn content.`;

  const profileSection = `
USER PROFILE:
- Name: ${userProfile.fullName || 'Not provided'}
- Headline: ${userProfile.headline || 'Not provided'}
- About: ${userProfile.about || 'Not provided'}
- Goals: ${userProfile.goals.join(', ') || 'Not specified'}`;

  const voiceSection = `
WRITING VOICE & STYLE:
${voiceProfile.analysisSummary || 'Analysis in progress'}

Tone: ${voiceProfile.overallTone || 'To be determined'}
Style: ${voiceProfile.writingStyle || 'To be determined'}
Key Topics: ${voiceProfile.commonTopics.join(', ') || 'Various'}`;

  const instructionsSection = `
INSTRUCTIONS:
1. Generate content that matches the user's authentic voice and style
2. Focus on topics aligned with their goals and expertise
3. Use their typical tone, sentence structure, and formatting patterns
4. Provide actionable suggestions for improvement
5. When generating posts, offer 2-3 variations to choose from
6. Always explain your reasoning for content choices
7. Be conversational and collaborative in your responses`;

  const contextNote =
    chatType === 'new_perspective'
      ? '\n\nNOTE: This is a NEW PERSPECTIVE chat - focus only on the current request without referencing previous conversations.'
      : '\n\nNOTE: Use conversation history to maintain context and continuity.';

  return `${basePrompt}

${profileSection}

${voiceSection}

${instructionsSection}${contextNote}`;
}

export function buildOnboardingPrompt(step: 'goals'): string {
  if (step === 'goals') {
    return `You are helping a user define their LinkedIn content goals. Ask them about:
1. What they want to achieve on LinkedIn (followers, engagement, thought leadership, etc.)
2. Their target audience
3. Their timeline and commitment level

Be conversational and encouraging. Ask one question at a time.`;
  }

  return '';
}
```

## Step 8: Error Handling for OpenAI

Create `lib/openai/errors.ts`:

```typescript
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
```

## Step 9: Create OpenAI Types

Create `types/openai.ts`:

```typescript
export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatContext {
  systemPrompt: string;
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  totalTokens: number;
}

export interface StreamingOptions {
  onToken?: (token: string) => void;
  onComplete?: (fullResponse: string) => void;
  onError?: (error: Error) => void;
}
```

## Next Steps

Proceed to `05-CONTEXT-MANAGEMENT.md` for context and summarization implementation.