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
  const [initialMessages, setInitialMessages] = useState<any[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);

  useEffect(() => {
    // Fetch initial messages
    async function fetchMessages() {
      try {
        setIsLoadingMessages(true);
        const response = await fetch(`/api/messages?chatId=${chatId}`);
        if (response.ok) {
          const data = await response.json();
          setInitialMessages(data.messages || []);
        }
      } catch (err) {
        console.error('Failed to fetch messages:', err);
      } finally {
        setIsLoadingMessages(false);
      }
    }

    fetchMessages();
  }, [chatId]);

  const { messages, sendMessage, isLoading, error } = useChat({
    chatId,
    initialMessages,
  });

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Left Sidebar - Chat History */}
      <ChatSidebar userId={userId} currentChatId={chatId} />

      {/* Main Chat Area - Unified Container */}
      <div className="flex-1 flex flex-col min-w-0 relative bg-background">
        {/* Messages with infinite scroll */}
        <ChatMessages messages={messages} isLoading={isLoading} />
        
        {/* Sticky Input at Bottom - No Border */}
        <div className="sticky bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background to-transparent pt-8">
          <ChatInput
            onSend={sendMessage}
            disabled={isLoading}
            placeholder="Type your message..."
          />
          {error && (
            <div className="px-4 pb-2 text-destructive text-sm">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Analysis */}
      <AnalysisPanel userId={userId} />
    </div>
  );
}
