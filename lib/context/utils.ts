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

