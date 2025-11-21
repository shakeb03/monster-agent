import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
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

    // Use admin client to bypass RLS
  const supabase = createAdminClient();

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

