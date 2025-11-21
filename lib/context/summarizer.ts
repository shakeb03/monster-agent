import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function summarizeContext(text: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant that creates concise summaries of conversation context. Keep the essential information while reducing token count.',
      },
      {
        role: 'user',
        content: `Summarize the following conversation context, maintaining key details:\n\n${text}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 1000,
  });

  return response.choices[0].message.content || text;
}

export async function batchSummarizeMessages(
  chatId: string,
  userId: string
): Promise<void> {
  const supabase = await createClient();

  // Get messages since last summary
  const { data: lastSummary } = await supabase
    .from('context_summaries')
    .select('created_at')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  let query = supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });

  if (lastSummary) {
    query = query.gt('created_at', lastSummary.created_at);
  }

  const { data: messages } = await query;

  if (!messages || messages.length < 5) {
    return; // Not enough messages to summarize
  }

  // Create summary text from messages
  const conversationText = messages
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n\n');

  const summaryText = await summarizeContext(conversationText);

  // Save summary
  await supabase.from('context_summaries').insert({
    chat_id: chatId,
    user_id: userId,
    summary_text: summaryText,
    messages_included: messages.length,
    token_count: Math.ceil(summaryText.length / 4),
    summary_type: 'batch',
  });
}

export async function summarizeLongContext(
  chatId: string,
  userId: string
): Promise<void> {
  const supabase = await createClient();

  // Get all messages and summaries
  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });

  const { data: summaries } = await supabase
    .from('context_summaries')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });

  // Combine everything into one context
  let fullContext = '';

  if (summaries && summaries.length > 0) {
    fullContext += 'Previous conversation summaries:\n';
    fullContext += summaries.map((s) => s.summary_text).join('\n\n');
    fullContext += '\n\n';
  }

  if (messages && messages.length > 0) {
    fullContext += 'Recent messages:\n';
    fullContext += messages
      .slice(-20) // Last 20 messages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n\n');
  }

  const summarizedContext = await summarizeContext(fullContext);

  // Update or create long context
  await supabase
    .from('long_context')
    .upsert({
      user_id: userId,
      context_text: summarizedContext,
      total_tokens: Math.ceil(summarizedContext.length / 4),
      last_updated: new Date().toISOString(),
    });
}

