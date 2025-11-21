'use client';

import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { User, Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';

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
            isUser ? 'prose-invert' : 'dark:prose-invert',
            // Better markdown styling
            'prose-headings:mt-4 prose-headings:mb-2',
            'prose-p:my-2',
            'prose-pre:bg-black prose-pre:text-white prose-pre:p-4 prose-pre:rounded-lg',
            'prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded',
            'prose-strong:font-bold',
            'prose-ul:my-2 prose-li:my-1'
          )}>
            <ReactMarkdown
              components={{
                // Custom rendering for better formatting
                h3: ({ children }) => (
                  <h3 className="text-base font-bold mt-4 mb-2 text-foreground">
                    {children}
                  </h3>
                ),
                p: ({ children }) => (
                  <p className="my-2 leading-relaxed">{children}</p>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-foreground">{children}</strong>
                ),
                ul: ({ children }) => (
                  <ul className="my-2 space-y-1 list-disc list-inside">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="my-2 space-y-1 list-decimal list-inside">{children}</ol>
                ),
                li: ({ children }) => (
                  <li className="ml-2">{children}</li>
                ),
                code: ({ className, children }) => {
                  const isInline = !className;
                  return isInline ? (
                    <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">
                      {children}
                    </code>
                  ) : (
                    <code className={className}>{children}</code>
                  );
                },
              }}
            >
              {content}
            </ReactMarkdown>
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
