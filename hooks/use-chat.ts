'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface UseChatOptions {
  chatId: string;
  initialMessages?: Message[];
}

export function useChat({ chatId, initialMessages = [] }: UseChatOptions) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      const userMessage: Message = { role: 'user', content };
      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: content,
            chatId,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to send message');
        }

        const newChatId = response.headers.get('X-Chat-Id');
        if (newChatId && newChatId !== chatId) {
          router.push(`/chat/${newChatId}`);
        }

        // Handle streaming response
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let assistantMessage = '';

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            assistantMessage += chunk;

            setMessages((prev) => {
              const lastMessage = prev[prev.length - 1];
              if (lastMessage?.role === 'assistant') {
                return [
                  ...prev.slice(0, -1),
                  { role: 'assistant', content: assistantMessage },
                ];
              } else {
                return [...prev, { role: 'assistant', content: assistantMessage }];
              }
            });
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        setMessages((prev) => prev.slice(0, -1)); // Remove user message on error
      } finally {
        setIsLoading(false);
      }
    },
    [chatId, isLoading, router]
  );

  return {
    messages,
    isLoading,
    error,
    sendMessage,
  };
}

