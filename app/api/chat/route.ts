import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runAgent } from '@/lib/agent/orchestrator';
import { logAgentAction } from '@/lib/agent/monitor';

interface ChatRequest {
  message: string;
  chatId?: string;
  chatType?: 'standard' | 'new_perspective';
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { message, chatId, chatType = 'standard' }: ChatRequest = await req.json();

    if (!message || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Use admin client to bypass RLS
    const supabase = createAdminClient();

    // Get user from database
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_user_id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Create chat if needed
    let currentChatId = chatId;
    if (!currentChatId) {
      const { data: newChat } = await supabase
        .from('chats')
        .insert({
          user_id: user.id,
          title: message.substring(0, 50),
          chat_type: chatType,
        })
        .select()
        .single();

      currentChatId = newChat?.id;
    }

    // Save user message
    await supabase.from('messages').insert({
      chat_id: currentChatId,
      user_id: user.id,
      role: 'user',
      content: message,
      token_count: Math.ceil(message.length / 4),
    });

    // Run agent (this handles all tool calls automatically)
    const startTime = Date.now();
    const agentResponse = await runAgent(user.id, message);
    const responseTime = Date.now() - startTime;

    // Log agent action for monitoring
    await logAgentAction(user.id, {
      request: message,
      toolsUsed: agentResponse.toolsUsed,
      contextTokens: Math.ceil(agentResponse.finalAnswer.length / 4),
      responseTime,
      success: true,
    }).catch(console.error); // Don't fail request if logging fails

    // Save assistant response
    await supabase.from('messages').insert({
      chat_id: currentChatId,
      user_id: user.id,
      role: 'assistant',
      content: agentResponse.finalAnswer,
      token_count: Math.ceil(agentResponse.finalAnswer.length / 4),
    });

    // Update chat
    const { data: chat } = await supabase
      .from('chats')
      .select('message_count')
      .eq('id', currentChatId)
      .single();

    await supabase
      .from('chats')
      .update({
        last_message_at: new Date().toISOString(),
        message_count: (chat?.message_count || 0) + 2,
      })
      .eq('id', currentChatId);

    return NextResponse.json({
      success: true,
      response: agentResponse.finalAnswer,
      toolsUsed: agentResponse.toolsUsed,
      chatId: currentChatId,
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

