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
