import { createClient } from '@/lib/supabase/server';

interface ContextResult {
  systemPrompt: string;
  conversationHistory: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
}

export async function getContextForChat(
  userId: string,
  chatId: string,
  chatType: 'standard' | 'new_perspective'
): Promise<ContextResult> {
  const supabase = await createClient();

  // Get voice analysis
  const { data: voiceAnalysis } = await supabase
    .from('voice_analysis')
    .select('*')
    .eq('user_id', userId)
    .single();

  // Get user goals
  const { data: user } = await supabase
    .from('users')
    .select('goals')
    .eq('id', userId)
    .single();

  // Get long context if exists
  const { data: longContext } = await supabase
    .from('long_context')
    .select('*')
    .eq('user_id', userId)
    .single();

  // Get recent messages (last 20)
  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(20);

  // Build system prompt
  let systemPrompt = `You are a LinkedIn content creation assistant. `;

  if (chatType === 'new_perspective') {
    systemPrompt += `Your role is to help create content from a COMPLETELY NEW perspective - different tone, style, and approach than the user's typical voice. Be creative and bold with suggestions that break from their usual patterns.\n\n`;
  } else {
    systemPrompt += `Your role is to help create LinkedIn content that matches the user's authentic voice and style.\n\n`;
  }

  if (voiceAnalysis) {
    systemPrompt += `USER'S VOICE PROFILE:\n`;
    systemPrompt += `- Tone: ${voiceAnalysis.overall_tone}\n`;
    systemPrompt += `- Writing Style: ${voiceAnalysis.writing_style}\n`;
    systemPrompt += `- Common Topics: ${voiceAnalysis.common_topics.join(', ')}\n`;
    systemPrompt += `- Strengths: ${voiceAnalysis.strengths.join(', ')}\n`;
    
    if (chatType === 'standard') {
      systemPrompt += `\nMaintain this voice while helping them create content.\n`;
    } else {
      systemPrompt += `\nNote: For this session, deliberately suggest alternatives to their typical style.\n`;
    }
  }

  if (user?.goals && user.goals.length > 0) {
    systemPrompt += `\nUSER'S GOALS: ${user.goals.join(', ')}\n`;
  }

  if (longContext) {
    systemPrompt += `\nCONVERSATION CONTEXT:\n${longContext.context_text}\n`;
  }

  // Reverse messages to get chronological order
  const conversationHistory = (messages || [])
    .reverse()
    .map((msg) => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
    }));

  return {
    systemPrompt,
    conversationHistory,
  };
}

export async function shouldSummarizeContext(chatId: string): Promise<boolean> {
  const supabase = await createClient();

  const { data: chat } = await supabase
    .from('chats')
    .select('total_tokens')
    .eq('id', chatId)
    .single();

  // Trigger summarization if approaching 200k tokens
  return (chat?.total_tokens || 0) > 180000;
}

export async function getMessageCountSinceLastSummary(
  chatId: string
): Promise<number> {
  const supabase = await createClient();

  // Get the most recent summary
  const { data: lastSummary } = await supabase
    .from('context_summaries')
    .select('created_at')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!lastSummary) {
    // No summaries yet, count all messages
    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('chat_id', chatId);

    return count || 0;
  }

  // Count messages since last summary
  const { count } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('chat_id', chatId)
    .gt('created_at', lastSummary.created_at);

  return count || 0;
}

