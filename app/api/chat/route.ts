import { auth } from '@clerk/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { OpenAIStream, StreamingTextResponse } from 'ai';
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';
import { getContextForChat, shouldSummarizeContext } from '@/lib/context/manager';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export const runtime = 'edge';

interface ChatRequest {
  message: string;
  chatId?: string;
  chatType?: 'standard' | 'new_perspective';
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { message, chatId, chatType = 'standard' }: ChatRequest = await req.json();

    if (!message || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const supabase = await createClient();

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

    // Stream response from OpenAI
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 2000,
    });

    const stream = OpenAIStream(response, {
      async onCompletion(completion) {
        // Save assistant message
        await supabase
          .from('messages')
          .insert({
            chat_id: currentChatId,
            user_id: user.id,
            role: 'assistant',
            content: completion,
            token_count: Math.ceil(completion.length / 4),
          });

        // Update total tokens
        const totalTokens = Math.ceil((message.length + completion.length) / 4);
        await supabase
          .from('chats')
          .update({
            total_tokens: supabase.rpc('increment', { x: totalTokens }),
          })
          .eq('id', currentChatId);
      },
    });

    return new StreamingTextResponse(stream, {
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

