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
    <div className={cn('flex gap-3 items-start', isUser && 'flex-row-reverse')}>
      <Avatar
        className={cn(
          'h-8 w-8 flex items-center justify-center flex-shrink-0 mt-1',
          isUser ? 'bg-primary' : 'bg-secondary'
        )}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4" />
        )}
      </Avatar>

      <div className={cn('flex-1 space-y-1', isUser && 'flex flex-col items-end')}>
        <div
          className={cn(
            'inline-block px-4 py-2.5 rounded-2xl max-w-[85%]',
            isUser
              ? 'bg-primary text-primary-foreground rounded-tr-sm'
              : 'bg-muted text-foreground rounded-tl-sm'
          )}
        >
          <div className={cn(
            'prose prose-sm max-w-none',
            isUser ? 'prose-invert' : 'dark:prose-invert'
          )}>
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        </div>
        {timestamp && (
          <p className={cn(
            'text-xs text-muted-foreground px-1',
            isUser && 'text-right'
          )}>
            {new Date(timestamp).toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </p>
        )}
      </div>
    </div>
  );
}
