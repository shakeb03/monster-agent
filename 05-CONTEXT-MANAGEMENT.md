# 05-CONTEXT-MANAGEMENT.md - Context Management & Summarization

## Step 1: Create Context Manager

Create `lib/context/manager.ts`:

```typescript
import { createClient } from '@/lib/supabase/server';
import { estimateTokensFromMessages, shouldSummarizeBasedOnTokens } from '@/lib/openai/tokens';
import { buildSystemPrompt } from '@/lib/openai/prompts';
import type { ChatContext } from '@/types/openai';

interface ContextOptions {
  maxMessages?: number;
  includeSystemPrompt?: boolean;
}

export async function getContextForChat(
  userId: string,
  chatId: string,
  chatType: 'standard' | 'new_perspective',
  options: ContextOptions = {}
): Promise<ChatContext> {
  const { maxMessages = 50, includeSystemPrompt = true } = options;

  const supabase = await createClient();

  // Get user profile
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  // Get LinkedIn profile
  const { data: profile } = await supabase
    .from('linkedin_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  // Get voice analysis
  const { data: voiceAnalysis } = await supabase
    .from('voice_analysis')
    .select('*')
    .eq('user_id', userId)
    .single();

  // Build system prompt
  const systemPrompt = buildSystemPrompt(
    {
      fullName: profile?.full_name || null,
      headline: profile?.headline || null,
      about: profile?.about || null,
      goals: user?.goals || [],
    },
    {
      overallTone: voiceAnalysis?.overall_tone || null,
      writingStyle: voiceAnalysis?.writing_style || null,
      commonTopics: voiceAnalysis?.common_topics || [],
      analysisSummary: voiceAnalysis?.analysis_summary || null,
    },
    chatType
  );

  let conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  if (chatType === 'standard') {
    // Get long context summary for standard chats
    const { data: longContext } = await supabase
      .from('long_context')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (longContext) {
      // Add long context as a system message in history
      conversationHistory.push({
        role: 'assistant',
        content: `[Context Summary]: ${longContext.context_text}`,
      });
    }

    // Get recent context summaries for this chat
    const { data: summaries } = await supabase
      .from('context_summaries')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(3);

    if (summaries && summaries.length > 0) {
      for (const summary of summaries.reverse()) {
        conversationHistory.push({
          role: 'assistant',
          content: `[Summary]: ${summary.summary_text}`,
        });
      }
    }
  }

  // Get recent messages
  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(maxMessages);

  if (messages) {
    // Reverse to get chronological order
    const recentMessages = messages.reverse();
    
    conversationHistory.push(
      ...recentMessages.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }))
    );
  }

  // Calculate total tokens
  const totalTokens = estimateTokensFromMessages([
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
  ]);

  return {
    systemPrompt,
    conversationHistory,
    totalTokens,
  };
}

export async function shouldSummarizeContext(chatId: string): Promise<boolean> {
  const supabase = await createClient();

  const { data: chat } = await supabase
    .from('chats')
    .select('total_tokens')
    .eq('id', chatId)
    .single();

  if (!chat) return false;

  return shouldSummarizeBasedOnTokens(chat.total_tokens);
}

export async function getMessagesForSummarization(
  chatId: string,
  messageCount: number
): Promise<Array<{ role: 'user' | 'assistant'; content: string; id: string }>> {
  const supabase = await createClient();

  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(messageCount);

  if (!messages) return [];

  return messages.reverse().map((msg) => ({
    id: msg.id,
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
  }));
}
```

## Step 2: Create Batch Summarization API

Create `app/api/context/batch/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { summarizeConversation } from '@/lib/openai/summarize';
import { getMessagesForSummarization } from '@/lib/context/manager';
import { estimateTokenCount } from '@/lib/openai/tokens';

export const runtime = 'nodejs';

interface BatchSummarizeRequest {
  chatId: string;
  userId: string;
}

export async function POST(req: NextRequest) {
  try {
    const { chatId, userId }: BatchSummarizeRequest = await req.json();

    if (!chatId || !userId) {
      return NextResponse.json(
        { error: 'chatId and userId are required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get user to verify ownership
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get the last 10 messages (5 user + 5 assistant)
    const messages = await getMessagesForSummarization(chatId, 10);

    if (messages.length === 0) {
      return NextResponse.json(
        { error: 'No messages to summarize' },
        { status: 400 }
      );
    }

    // Create summary
    const summaryText = await summarizeConversation(messages);
    const tokenCount = estimateTokenCount(summaryText);

    // Save summary to database
    const { error: summaryError } = await supabase
      .from('context_summaries')
      .insert({
        chat_id: chatId,
        user_id: userId,
        summary_text: summaryText,
        messages_included: messages.length,
        token_count: tokenCount,
        summary_type: 'batch',
      });

    if (summaryError) {
      console.error('Error saving summary:', summaryError);
      return NextResponse.json(
        { error: 'Failed to save summary' },
        { status: 500 }
      );
    }

    // Update long context
    await updateLongContext(userId, summaryText);

    return NextResponse.json({
      success: true,
      summary: summaryText,
      messagesIncluded: messages.length,
    });
  } catch (error) {
    console.error('Batch summarization error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function updateLongContext(
  userId: string,
  newSummary: string
): Promise<void> {
  const supabase = await createClient();

  // Get existing long context
  const { data: existing } = await supabase
    .from('long_context')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (existing) {
    // Append new summary to existing context
    const updatedContext = `${existing.context_text}\n\n${newSummary}`;
    const tokenCount = estimateTokenCount(updatedContext);

    await supabase
      .from('long_context')
      .update({
        context_text: updatedContext,
        total_tokens: tokenCount,
        last_updated: new Date().toISOString(),
      })
      .eq('user_id', userId);
  } else {
    // Create new long context
    const tokenCount = estimateTokenCount(newSummary);

    await supabase.from('long_context').insert({
      user_id: userId,
      context_text: newSummary,
      total_tokens: tokenCount,
    });
  }
}
```

## Step 3: Create Auto-Summarization API

Create `app/api/context/summarize/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { summarizeLongContext } from '@/lib/openai/summarize';
import { estimateTokenCount } from '@/lib/openai/tokens';

export const runtime = 'nodejs';

interface SummarizeRequest {
  chatId: string;
  userId: string;
}

export async function POST(req: NextRequest) {
  try {
    const { chatId, userId }: SummarizeRequest = await req.json();

    if (!chatId || !userId) {
      return NextResponse.json(
        { error: 'chatId and userId are required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get current long context
    const { data: longContext } = await supabase
      .from('long_context')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!longContext) {
      return NextResponse.json(
        { error: 'No context to summarize' },
        { status: 400 }
      );
    }

    // Check if summarization is needed
    if (longContext.total_tokens < 180000) {
      return NextResponse.json({
        success: true,
        message: 'Context is within limits, no summarization needed',
      });
    }

    console.log(`Summarizing context for user ${userId}, current tokens: ${longContext.total_tokens}`);

    // Summarize the long context
    const summarizedContext = await summarizeLongContext(longContext.context_text);
    const newTokenCount = estimateTokenCount(summarizedContext);

    // Update long context with summarized version
    await supabase
      .from('long_context')
      .update({
        context_text: summarizedContext,
        total_tokens: newTokenCount,
        last_updated: new Date().toISOString(),
      })
      .eq('user_id', userId);

    // Log the summarization in context_summaries
    await supabase.from('context_summaries').insert({
      chat_id: chatId,
      user_id: userId,
      summary_text: summarizedContext,
      messages_included: 0,
      token_count: newTokenCount,
      summary_type: 'auto_compress',
    });

    console.log(`Context summarized for user ${userId}, new tokens: ${newTokenCount}`);

    return NextResponse.json({
      success: true,
      previousTokens: longContext.total_tokens,
      newTokens: newTokenCount,
      reduction: longContext.total_tokens - newTokenCount,
    });
  } catch (error) {
    console.error('Auto-summarization error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

## Step 4: Create Context Utilities

Create `lib/context/utils.ts`:

```typescript
import { createClient } from '@/lib/supabase/server';

export async function getChatTokenCount(chatId: string): Promise<number> {
  const supabase = await createClient();

  const { data: chat } = await supabase
    .from('chats')
    .select('total_tokens')
    .eq('id', chatId)
    .single();

  return chat?.total_tokens || 0;
}

export async function getLongContextTokenCount(userId: string): Promise<number> {
  const supabase = await createClient();

  const { data: longContext } = await supabase
    .from('long_context')
    .select('total_tokens')
    .eq('user_id', userId)
    .single();

  return longContext?.total_tokens || 0;
}

export async function incrementChatTokens(
  chatId: string,
  additionalTokens: number
): Promise<void> {
  const supabase = await createClient();

  const { data: chat } = await supabase
    .from('chats')
    .select('total_tokens')
    .eq('id', chatId)
    .single();

  const newTotal = (chat?.total_tokens || 0) + additionalTokens;

  await supabase
    .from('chats')
    .update({ total_tokens: newTotal })
    .eq('id', chatId);
}

export function shouldTriggerBatchSummarization(messageCount: number): boolean {
  // Trigger every 10 messages (5 user + 5 assistant)
  return messageCount > 0 && messageCount % 10 === 0;
}

export async function getRecentSummaries(
  chatId: string,
  limit = 3
): Promise<Array<{ id: string; summary_text: string; created_at: string }>> {
  const supabase = await createClient();

  const { data: summaries } = await supabase
    .from('context_summaries')
    .select('id, summary_text, created_at')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return summaries || [];
}
```

## Step 5: Create Context Types

Create `types/context.ts`:

```typescript
export interface ContextSummary {
  id: string;
  chatId: string;
  userId: string;
  summaryText: string;
  messagesIncluded: number;
  tokenCount: number;
  summaryType: 'batch' | 'auto_compress';
  createdAt: string;
}

export interface LongContext {
  id: string;
  userId: string;
  contextText: string;
  totalTokens: number;
  lastUpdated: string;
  createdAt: string;
}

export interface ContextMetrics {
  currentTokens: number;
  maxTokens: number;
  utilizationPercentage: number;
  needsSummarization: boolean;
}
```

## Step 6: Create Context Monitoring

Create `lib/context/monitor.ts`:

```typescript
import { getChatTokenCount, getLongContextTokenCount } from './utils';
import type { ContextMetrics } from '@/types/context';

const MAX_CONTEXT_TOKENS = 200000;
const SUMMARIZATION_THRESHOLD = 180000;

export async function getContextMetrics(
  chatId: string,
  userId: string
): Promise<ContextMetrics> {
  const chatTokens = await getChatTokenCount(chatId);
  const longContextTokens = await getLongContextTokenCount(userId);
  
  const currentTokens = chatTokens + longContextTokens;
  const utilizationPercentage = (currentTokens / MAX_CONTEXT_TOKENS) * 100;
  const needsSummarization = currentTokens >= SUMMARIZATION_THRESHOLD;

  return {
    currentTokens,
    maxTokens: MAX_CONTEXT_TOKENS,
    utilizationPercentage: parseFloat(utilizationPercentage.toFixed(2)),
    needsSummarization,
  };
}

export function getContextHealthStatus(
  metrics: ContextMetrics
): 'healthy' | 'warning' | 'critical' {
  if (metrics.utilizationPercentage < 75) {
    return 'healthy';
  } else if (metrics.utilizationPercentage < 90) {
    return 'warning';
  } else {
    return 'critical';
  }
}
```

## Step 7: Testing Context Management

Create `lib/context/__tests__/manager.test.ts`:

```typescript
import { shouldTriggerBatchSummarization } from '../utils';
import { estimateTokenCount, shouldSummarizeBasedOnTokens } from '@/lib/openai/tokens';

describe('Context Management', () => {
  describe('Batch Summarization Trigger', () => {
    it('should trigger every 10 messages', () => {
      expect(shouldTriggerBatchSummarization(10)).toBe(true);
      expect(shouldTriggerBatchSummarization(20)).toBe(true);
      expect(shouldTriggerBatchSummarization(30)).toBe(true);
      
      expect(shouldTriggerBatchSummarization(5)).toBe(false);
      expect(shouldTriggerBatchSummarization(15)).toBe(false);
    });
  });

  describe('Token Counting', () => {
    it('should estimate tokens correctly', () => {
      const shortText = 'Hello world';
      const tokens = estimateTokenCount(shortText);
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(10);
    });

    it('should detect when summarization is needed', () => {
      expect(shouldSummarizeBasedOnTokens(180000)).toBe(true);
      expect(shouldSummarizeBasedOnTokens(200000)).toBe(true);
      expect(shouldSummarizeBasedOnTokens(100000)).toBe(false);
    });
  });
});
```

## Next Steps

Proceed to `06-FRONTEND-LAYOUT.md` for Next.js frontend structure and routing.