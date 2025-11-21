# 08-CHAT-INTERFACE.md - Chat Interface Implementation

## Step 1: Create Main Chat Interface Component

Create `components/chat/chat-interface.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import ChatSidebar from './chat-sidebar';
import ChatMessages from './chat-messages';
import ChatInput from './chat-input';
import AnalysisPanel from '../analysis/analysis-panel';
import { useChat } from '@/hooks/use-chat';

interface ChatInterfaceProps {
  chatId: string;
  userId: string;
}

export default function ChatInterface({ chatId, userId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<any[]>([]);
  const { sendMessage, isLoading, error } = useChat({
    chatId,
    initialMessages: messages,
  });

  useEffect(() => {
    // Fetch initial messages
    async function fetchMessages() {
      try {
        const response = await fetch(`/api/messages?chatId=${chatId}`);
        if (response.ok) {
          const data = await response.json();
          setMessages(data.messages || []);
        }
      } catch (err) {
        console.error('Failed to fetch messages:', err);
      }
    }

    fetchMessages();
  }, [chatId]);

  return (
    <div className="flex h-screen w-full">
      {/* Left Sidebar - Chat History */}
      <ChatSidebar userId={userId} currentChatId={chatId} />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        <ChatMessages messages={messages} isLoading={isLoading} />
        <ChatInput
          onSend={sendMessage}
          disabled={isLoading}
          placeholder="Type your message..."
        />
        {error && (
          <div className="px-4 py-2 bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Right Panel - Analysis */}
      <AnalysisPanel userId={userId} />
    </div>
  );
}
```

## Step 2: Create Chat Sidebar Component

Create `components/chat/chat-sidebar.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, MessageSquare, Trash2 } from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { UserProfile } from '../user/user-profile';

interface Chat {
  id: string;
  title: string;
  last_message_at: string | null;
  chat_type: 'standard' | 'new_perspective';
}

interface ChatSidebarProps {
  userId: string;
  currentChatId?: string;
}

export default function ChatSidebar({ userId, currentChatId }: ChatSidebarProps) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchChats();
  }, [userId]);

  async function fetchChats() {
    try {
      const response = await fetch('/api/chats');
      if (response.ok) {
        const data = await response.json();
        setChats(data.chats || []);
      }
    } catch (err) {
      console.error('Failed to fetch chats:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function createNewChat(type: 'standard' | 'new_perspective' = 'standard') {
    try {
      const response = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatType: type }),
      });

      if (response.ok) {
        const data = await response.json();
        router.push(`/chat/${data.chat.id}`);
        fetchChats();
      }
    } catch (err) {
      console.error('Failed to create chat:', err);
    }
  }

  async function deleteChat(chatId: string, e: React.MouseEvent) {
    e.stopPropagation();
    
    if (!confirm('Delete this chat?')) return;

    try {
      await fetch(`/api/chats/${chatId}`, {
        method: 'DELETE',
      });
      
      fetchChats();
      
      if (chatId === currentChatId) {
        router.push('/chat');
      }
    } catch (err) {
      console.error('Failed to delete chat:', err);
    }
  }

  return (
    <div className="w-64 border-r border-border flex flex-col h-full bg-card">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold mb-3">Chats</h2>
        <div className="space-y-2">
          <Button
            onClick={() => createNewChat('standard')}
            className="w-full justify-start"
            size="sm"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Chat
          </Button>
          <Button
            onClick={() => createNewChat('new_perspective')}
            variant="outline"
            className="w-full justify-start"
            size="sm"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Perspective
          </Button>
        </div>
      </div>

      {/* Chat List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {isLoading ? (
            <div className="text-sm text-muted-foreground p-4 text-center">
              Loading chats...
            </div>
          ) : chats.length === 0 ? (
            <div className="text-sm text-muted-foreground p-4 text-center">
              No chats yet
            </div>
          ) : (
            chats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => router.push(`/chat/${chat.id}`)}
                className={cn(
                  'group flex items-center gap-2 p-3 rounded-lg cursor-pointer transition-colors',
                  'hover:bg-accent',
                  currentChatId === chat.id && 'bg-accent'
                )}
              >
                <MessageSquare className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{chat.title}</p>
                  {chat.last_message_at && (
                    <p className="text-xs text-muted-foreground">
                      {formatRelativeTime(chat.last_message_at)}
                    </p>
                  )}
                  {chat.chat_type === 'new_perspective' && (
                    <span className="text-xs text-blue-400">New Perspective</span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => deleteChat(chat.id, e)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* User Profile */}
      <div className="border-t border-border">
        <UserProfile />
      </div>
    </div>
  );
}
```

## Step 3: Create Chat Messages Component

Create `components/chat/chat-messages.tsx`:

```typescript
'use client';

import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import ChatMessage from './chat-message';
import { Loader2 } from 'lucide-react';

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

interface ChatMessagesProps {
  messages: Message[];
  isLoading?: boolean;
}

export default function ChatMessages({ messages, isLoading }: ChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <ScrollArea className="flex-1 p-4" ref={scrollRef}>
      {messages.length === 0 && !isLoading ? (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <div className="text-center">
            <p className="text-lg font-medium mb-2">No messages yet</p>
            <p className="text-sm">Start a conversation to create LinkedIn content</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4 max-w-4xl mx-auto">
          {messages.map((message, index) => (
            <ChatMessage
              key={message.id || index}
              role={message.role}
              content={message.content}
              timestamp={message.created_at}
            />
          ))}
          {isLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      )}
    </ScrollArea>
  );
}
```

## Step 4: Create Chat Message Component

Create `components/chat/chat-message.tsx`:

```typescript
'use client';

import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { User, Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export default function ChatMessage({ role, content, timestamp }: ChatMessageProps) {
  const isUser = role === 'user';

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <Avatar
        className={cn(
          'h-8 w-8 flex items-center justify-center',
          isUser ? 'bg-primary' : 'bg-secondary'
        )}
      >
        {isUser ? (
          <User className="h-5 w-5" />
        ) : (
          <Bot className="h-5 w-5" />
        )}
      </Avatar>

      <div
        className={cn(
          'flex-1 px-4 py-3 rounded-lg',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-secondary text-secondary-foreground'
        )}
      >
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
        {timestamp && (
          <p className="text-xs opacity-50 mt-2">
            {new Date(timestamp).toLocaleTimeString()}
          </p>
        )}
      </div>
    </div>
  );
}
```

## Step 5: Create Chat Input Component

Create `components/chat/chat-input.tsx`:

```typescript
'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function ChatInput({
  onSend,
  disabled = false,
  placeholder = 'Type your message...',
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSend() {
    if (!input.trim() || disabled) return;

    onSend(input.trim());
    setInput('');
    
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInput() {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }

  return (
    <div className="border-t border-border p-4 bg-card">
      <div className="flex gap-2 max-w-4xl mx-auto">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={placeholder}
          disabled={disabled}
          className="min-h-[60px] max-h-[200px] resize-none"
          rows={1}
        />
        <Button
          onClick={handleSend}
          disabled={disabled || !input.trim()}
          size="icon"
          className="h-[60px] w-[60px] flex-shrink-0"
        >
          <Send className="h-5 w-5" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground text-center mt-2">
        Press Enter to send, Shift+Enter for new line
      </p>
    </div>
  );
}
```

## Step 6: Create Messages API Route

Create `app/api/messages/route.ts`:

```typescript
import { auth } from '@clerk/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const { userId } = auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const chatId = searchParams.get('chatId');

    if (!chatId) {
      return NextResponse.json({ error: 'chatId is required' }, { status: 400 });
    }

    const supabase = await createClient();

    // Get user from database
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_user_id', userId)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verify chat belongs to user
    const { data: chat } = await supabase
      .from('chats')
      .select('*')
      .eq('id', chatId)
      .eq('user_id', user.id)
      .single();

    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    // Get messages
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch messages' },
        { status: 500 }
      );
    }

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Messages fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

## Step 7: Create Chats API Route

Create `app/api/chats/route.ts`:

```typescript
import { auth } from '@clerk/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const { userId } = auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_user_id', userId)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data: chats, error } = await supabase
      .from('chats')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch chats' },
        { status: 500 }
      );
    }

    return NextResponse.json({ chats });
  } catch (error) {
    console.error('Chats fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { chatType = 'standard' }: { chatType?: 'standard' | 'new_perspective' } =
      await req.json();

    const supabase = await createClient();

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_user_id', userId)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data: chat, error } = await supabase
      .from('chats')
      .insert({
        user_id: user.id,
        title: 'New Chat',
        chat_type: chatType,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to create chat' },
        { status: 500 }
      );
    }

    return NextResponse.json({ chat });
  } catch (error) {
    console.error('Chat creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

Create `app/api/chats/[chatId]/route.ts`:

```typescript
import { auth } from '@clerk/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { chatId: string } }
) {
  try {
    const { userId } = auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_user_id', userId)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Soft delete by setting is_active to false
    const { error } = await supabase
      .from('chats')
      .update({ is_active: false })
      .eq('id', params.chatId)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to delete chat' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Chat deletion error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

## Step 8: Add React Markdown

Install the dependency:

```bash
npm install react-markdown
```

## Next Steps

Proceed to `09-ONBOARDING-FLOW.md` for onboarding implementation.