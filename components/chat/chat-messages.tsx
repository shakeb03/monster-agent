'use client';

import { useEffect, useRef } from 'react';
import ChatMessage from './chat-message';
import { Loader2, Sparkles } from 'lucide-react';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  return (
    <div 
      ref={scrollRef}
      className="flex-1 overflow-y-auto overflow-x-hidden"
      style={{ 
        scrollBehavior: 'smooth',
        WebkitOverflowScrolling: 'touch'
      }}
    >
      {messages.length === 0 && !isLoading ? (
        <div className="flex items-center justify-center h-full px-4">
          <div className="text-center max-w-md">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Start Your LinkedIn Journey</h3>
            <p className="text-sm text-muted-foreground">
              Ask me anything about creating engaging LinkedIn content, analyzing your posts, or getting content ideas tailored to your style.
            </p>
          </div>
        </div>
      ) : (
        <div className="min-h-full flex flex-col">
          {/* Spacer to push messages to bottom initially */}
          <div className="flex-1 min-h-[20px]" />
          
          {/* Messages Container */}
          <div className="w-full max-w-4xl mx-auto px-4 py-6 space-y-6">
            {messages.map((message, index) => (
              <ChatMessage
                key={message.id || index}
                role={message.role}
                content={message.content}
                timestamp={message.created_at}
              />
            ))}
            
            {isLoading && (
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            
            {/* Scroll anchor */}
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}

