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
