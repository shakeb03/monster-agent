# 06-FRONTEND-LAYOUT.md - Frontend Structure & Routing

## Step 1: Create Dashboard Layout

Create `app/(dashboard)/layout.tsx`:

```typescript
import { auth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = auth();

  if (!userId) {
    redirect('/sign-in');
  }

  const supabase = await createClient();

  // Get or create user in database
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('clerk_user_id', userId)
    .single();

  if (!user) {
    // Create user if doesn't exist
    const { data: clerkUser } = await fetch(
      `https://api.clerk.dev/v1/users/${userId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
        },
      }
    ).then((res) => res.json());

    await supabase.from('users').insert({
      clerk_user_id: userId,
      email: clerkUser.emailAddresses[0]?.emailAddress || '',
    });
  }

  return (
    <div className="flex h-screen w-full bg-background">
      {children}
    </div>
  );
}
```

## Step 2: Create Main Chat Page

Create `app/(dashboard)/chat/page.tsx`:

```typescript
import { auth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import OnboardingChat from '@/components/onboarding/onboarding-chat';
import ChatInterface from '@/components/chat/chat-interface';

export default async function ChatPage() {
  const { userId } = auth();

  if (!userId) {
    redirect('/sign-in');
  }

  const supabase = await createClient();

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('clerk_user_id', userId)
    .single();

  if (!user) {
    redirect('/sign-in');
  }

  // Check onboarding status
  const needsOnboarding = user.onboarding_status !== 'completed';

  if (needsOnboarding) {
    return <OnboardingChat user={user} />;
  }

  // Get or create default chat
  let { data: activeChat } = await supabase
    .from('chats')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .single();

  if (!activeChat) {
    const { data: newChat } = await supabase
      .from('chats')
      .insert({
        user_id: user.id,
        title: 'New Chat',
      })
      .select()
      .single();

    activeChat = newChat;
  }

  return <ChatInterface chatId={activeChat?.id || ''} userId={user.id} />;
}
```

## Step 3: Create Individual Chat Page

Create `app/(dashboard)/chat/[chatId]/page.tsx`:

```typescript
import { auth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ChatInterface from '@/components/chat/chat-interface';

interface ChatPageProps {
  params: {
    chatId: string;
  };
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { userId } = auth();

  if (!userId) {
    redirect('/sign-in');
  }

  const supabase = await createClient();

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('clerk_user_id', userId)
    .single();

  if (!user) {
    redirect('/sign-in');
  }

  // Verify chat belongs to user
  const { data: chat } = await supabase
    .from('chats')
    .select('*')
    .eq('id', params.chatId)
    .eq('user_id', user.id)
    .single();

  if (!chat) {
    redirect('/chat');
  }

  return <ChatInterface chatId={params.chatId} userId={user.id} />;
}
```

## Step 4: Create Auth Pages

Create `app/(auth)/sign-in/[[...sign-in]]/page.tsx`:

```typescript
import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <SignIn />
    </div>
  );
}
```

Create `app/(auth)/sign-up/[[...sign-up]]/page.tsx`:

```typescript
import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <SignUp />
    </div>
  );
}
```

## Step 5: Create UI Component Types

Create `types/ui.ts`:

```typescript
export interface SidebarProps {
  userId: string;
  currentChatId?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface AnalysisPanelProps {
  userId: string;
}

export interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}
```

## Step 6: Create Loading States

Create `app/(dashboard)/chat/loading.tsx`:

```typescript
import { Skeleton } from '@/components/ui/skeleton';

export default function ChatLoading() {
  return (
    <div className="flex h-screen w-full">
      {/* Sidebar skeleton */}
      <div className="w-64 border-r border-border p-4">
        <Skeleton className="h-10 w-full mb-4" />
        <div className="space-y-2">
          {[...Array(10)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>

      {/* Main chat area skeleton */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 p-4 space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
              <Skeleton className="h-20 w-2/3" />
            </div>
          ))}
        </div>
        <div className="border-t border-border p-4">
          <Skeleton className="h-12 w-full" />
        </div>
      </div>

      {/* Analysis panel skeleton */}
      <div className="w-80 border-l border-border p-4">
        <Skeleton className="h-8 w-full mb-4" />
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
```

## Step 7: Create Error Boundary

Create `app/(dashboard)/error.tsx`:

```typescript
'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="text-center space-y-4">
        <h2 className="text-2xl font-bold">Something went wrong!</h2>
        <p className="text-muted-foreground">
          {error.message || 'An unexpected error occurred'}
        </p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
```

## Step 8: Create Not Found Page

Create `app/(dashboard)/not-found.tsx`:

```typescript
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="text-center space-y-4">
        <h2 className="text-2xl font-bold">404 - Page Not Found</h2>
        <p className="text-muted-foreground">
          The page you're looking for doesn't exist.
        </p>
        <Button asChild>
          <Link href="/chat">Go to Chat</Link>
        </Button>
      </div>
    </div>
  );
}
```

## Step 9: Create Utils for Client-Side

Create `lib/utils.ts`:

```typescript
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  const d = new Date(date);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatRelativeTime(date: string | Date): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return formatDate(date);
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}
```

## Step 10: Create Client Hooks

Create `hooks/use-chat.ts`:

```typescript
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
```

Create `hooks/use-analysis.ts`:

```typescript
'use client';

import { useState, useEffect } from 'react';

interface AnalysisData {
  voiceAnalysis: any;
  topPosts: any[];
  postingStats: {
    totalPosts: number;
    averageEngagement: string;
  };
}

export function useAnalysis(userId: string) {
  const [data, setData] = useState<AnalysisData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAnalysis() {
      try {
        const response = await fetch('/api/analysis');
        
        if (!response.ok) {
          throw new Error('Failed to fetch analysis');
        }

        const analysisData = await response.json();
        setData(analysisData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    }

    if (userId) {
      fetchAnalysis();
    }
  }, [userId]);

  return { data, isLoading, error };
}
```

## Next Steps

Proceed to `07-CLERK-AUTH.md` for detailed Clerk authentication setup.