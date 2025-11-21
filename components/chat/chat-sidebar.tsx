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
