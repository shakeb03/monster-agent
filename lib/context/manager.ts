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

