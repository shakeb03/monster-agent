import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { estimateTokensFromMessages, shouldSummarizeBasedOnTokens, estimateTokenCount } from '@/lib/openai/tokens';
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

// Viral-optimized context with aggressive compaction
export async function getViralOptimizedContext(
  userId: string,
  chatId: string,
  chatType: 'standard' | 'new_perspective'
): Promise<ChatContext> {
  const supabase = createAdminClient();

  // 1. Voice summary (200 tokens max)
  const { data: voiceAnalysis } = await supabase
    .from('voice_analysis')
    .select('overall_tone, writing_style, common_topics, analysis_summary')
    .eq('user_id', userId)
    .single();

  // 2. Top 5 viral patterns only (250 tokens max)
  const { data: topPatterns } = await supabase
    .from('viral_patterns')
    .select('pattern_type, pattern_description')
    .eq('user_id', userId)
    .order('success_rate', { ascending: false })
    .limit(5);

  // 3. Last 10 messages only (not full history)
  const { data: recentMessages } = await supabase
    .from('messages')
    .select('role, content')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(10);

  // Build compact system prompt
  const systemPrompt = `You create viral LinkedIn content using proven patterns.

Voice: ${voiceAnalysis?.overall_tone || 'professional'}
Style: ${voiceAnalysis?.writing_style || 'clear and direct'}

Top Patterns:
${topPatterns?.map(p => `- ${p.pattern_description}`).join('\n') || 'Use engaging hooks and clear structure'}

Always use these patterns. Be bold, specific, engaging.`;

  const conversationHistory = recentMessages?.reverse() || [];

  return {
    systemPrompt,
    conversationHistory: conversationHistory.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
    totalTokens: estimateTokenCount(systemPrompt) + estimateTokenCount(JSON.stringify(recentMessages)),
  };
}

