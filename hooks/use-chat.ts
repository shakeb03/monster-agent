'use client';

import { useState, useCallback, useEffect } from 'react';
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

  // Sync messages when chatId changes or initialMessages are loaded
  useEffect(() => {
    setMessages(initialMessages);
  }, [chatId]); // Reset messages when chat changes

  // Update messages when initial messages are first loaded
  useEffect(() => {
    if (initialMessages.length > 0 && messages.length === 0) {
      setMessages(initialMessages);
    }
  }, [initialMessages.length]);

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

        // Parse JSON response from agent
        const data = await response.json();

        // Check if we got a new chatId
        if (data.chatId && data.chatId !== chatId) {
          router.push(`/chat/${data.chatId}`);
        }

        // Add assistant message to state
        if (data.success && data.response) {
          const assistantMessage: Message = {
            role: 'assistant',
            content: data.response,
          };
          setMessages((prev) => [...prev, assistantMessage]);
        } else {
          throw new Error('Invalid response from server');
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

