import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createAdminClient } from '@/lib/supabase/admin';
import { getContextForChat, shouldSummarizeContext } from '@/lib/context/manager';

export const runtime = 'edge';

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

    let currentChatId = chatId;

    // Create new chat if no chatId provided
    if (!currentChatId) {
      const { data: newChat, error: chatError } = await supabase
        .from('chats')
        .insert({
          user_id: user.id,
          title: message.substring(0, 50),
          chat_type: chatType,
        })
        .select()
        .single();

      if (chatError || !newChat) {
        return NextResponse.json({ error: 'Failed to create chat' }, { status: 500 });
      }

      currentChatId = newChat.id;
    }

    // Get context based on chat type
    const context = await getContextForChat(user.id, currentChatId, chatType);

    // Save user message
    const { error: messageError } = await supabase
      .from('messages')
      .insert({
        chat_id: currentChatId,
        user_id: user.id,
        role: 'user',
        content: message,
        token_count: Math.ceil(message.length / 4), // Rough estimate
      });

    if (messageError) {
      return NextResponse.json({ error: 'Failed to save message' }, { status: 500 });
    }

    // Update chat message count
    const { data: chat } = await supabase
      .from('chats')
      .select('message_count')
      .eq('id', currentChatId)
      .single();

    const newMessageCount = (chat?.message_count || 0) + 1;

    await supabase
      .from('chats')
      .update({
        message_count: newMessageCount,
        last_message_at: new Date().toISOString(),
      })
      .eq('id', currentChatId);

    // Check if we need to batch summarize (every 5 user messages)
    if (newMessageCount % 10 === 0) {
      // Trigger batch summarization asynchronously
      fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/context/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: currentChatId, userId: user.id }),
      }).catch(console.error);
    }

    // Prepare messages for OpenAI
    const messages = [
      {
        role: 'system' as const,
        content: context.systemPrompt,
      },
      ...context.conversationHistory.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      {
        role: 'user' as const,
        content: message,
      },
    ];

    // Check if context needs summarization (approaching 200k tokens)
    if (await shouldSummarizeContext(currentChatId)) {
      fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/context/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: currentChatId, userId: user.id }),
      }).catch(console.error);
    }

    // Stream response using AI SDK
    const result = streamText({
      model: openai('gpt-4'),
      messages,
      temperature: 0.7,
      maxTokens: 2000,
      async onFinish({ text }) {
        // Save assistant message
        await supabase
          .from('messages')
          .insert({
            chat_id: currentChatId,
            user_id: user.id,
            role: 'assistant',
            content: text,
            token_count: Math.ceil(text.length / 4),
          });

        // Update total tokens
        const totalTokens = Math.ceil((message.length + text.length) / 4);
        await supabase
          .from('chats')
          .update({
            total_tokens: supabase.rpc('increment', { x: totalTokens }),
          })
          .eq('id', currentChatId);
      },
    });

    return result.toTextStreamResponse({
      headers: {
        'X-Chat-Id': currentChatId,
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

