# 07-CLERK-AUTH.md - Clerk Authentication Setup

## Step 1: Configure Clerk in Clerk Dashboard

1. Go to https://clerk.com and create an account
2. Create a new application
3. In the dashboard, configure:
   - **Email**: Enable email authentication
   - **OAuth**: Optionally enable Google, LinkedIn
   - **Paths**: Set redirect URLs:
     - Sign-in: `/sign-in`
     - Sign-up: `/sign-up`
     - After sign-in: `/chat`
     - After sign-up: `/chat`

## Step 2: Copy Clerk Keys to .env.local

From the Clerk dashboard, copy your keys:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
CLERK_SECRET_KEY=sk_test_xxxxx
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/chat
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/chat
```

## Step 3: Verify Middleware Configuration

Ensure `middleware.ts` is correctly configured:

```typescript
import { authMiddleware } from "@clerk/nextjs";

export default authMiddleware({
  // Routes that can be accessed without authentication
  publicRoutes: ["/sign-in", "/sign-up"],
  
  // Routes that are ignored by the middleware
  ignoredRoutes: ["/api/webhook"],
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
```

## Step 4: Create User Sync Utility

Create `lib/clerk/sync-user.ts`:

```typescript
import { createClient } from '@/lib/supabase/server';
import { User } from '@clerk/nextjs/server';

export async function syncUserToDatabase(clerkUser: User) {
  const supabase = await createClient();

  const email = clerkUser.emailAddresses.find(
    (e) => e.id === clerkUser.primaryEmailAddressId
  )?.emailAddress;

  if (!email) {
    throw new Error('No email found for user');
  }

  // Check if user exists
  const { data: existingUser } = await supabase
    .from('users')
    .select('*')
    .eq('clerk_user_id', clerkUser.id)
    .single();

  if (existingUser) {
    // Update existing user
    await supabase
      .from('users')
      .update({
        email,
        updated_at: new Date().toISOString(),
      })
      .eq('clerk_user_id', clerkUser.id);

    return existingUser;
  } else {
    // Create new user
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        clerk_user_id: clerkUser.id,
        email,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create user: ${error.message}`);
    }

    return newUser;
  }
}
```

## Step 5: Create Protected Route HOC

Create `lib/clerk/protected-route.tsx`:

```typescript
import { auth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
  requireOnboarding?: boolean;
}

export async function ProtectedRoute({
  children,
  requireOnboarding = false,
}: ProtectedRouteProps) {
  const { userId } = auth();

  if (!userId) {
    redirect('/sign-in');
  }

  if (requireOnboarding) {
    const supabase = await createClient();
    
    const { data: user } = await supabase
      .from('users')
      .select('onboarding_status')
      .eq('clerk_user_id', userId)
      .single();

    if (user && user.onboarding_status !== 'completed') {
      redirect('/chat'); // Will show onboarding
    }
  }

  return <>{children}</>;
}
```

## Step 6: Create User Context Provider

Create `components/providers/user-provider.tsx`:

```typescript
'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useUser as useClerkUser } from '@clerk/nextjs';
import type { User } from '@/types/database';

interface UserContextType {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  refreshUser: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const { user: clerkUser, isLoaded } = useClerkUser();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = async () => {
    if (!clerkUser) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/user');
      
      if (!response.ok) {
        throw new Error('Failed to fetch user');
      }

      const userData = await response.json();
      setUser(userData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isLoaded) {
      fetchUser();
    }
  }, [clerkUser, isLoaded]);

  const refreshUser = async () => {
    setIsLoading(true);
    await fetchUser();
  };

  return (
    <UserContext.Provider value={{ user, isLoading, error, refreshUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }

  return context;
}
```

## Step 7: Create User API Route

Create `app/api/user/route.ts`:

```typescript
import { auth } from '@clerk/nextjs';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const { userId } = auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_user_id', userId)
      .single();

    if (error || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('User fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

## Step 8: Add UserProvider to Layout

Update `app/layout.tsx`:

```typescript
import { ClerkProvider } from '@clerk/nextjs';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { UserProvider } from '@/components/providers/user-provider';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'LinkedIn Content Agent',
  description: 'AI-powered LinkedIn content creation in your style',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" className="dark">
        <body className={inter.className}>
          <UserProvider>
            {children}
          </UserProvider>
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  );
}
```

## Step 9: Create Clerk Utilities

Create `lib/clerk/utils.ts`:

```typescript
import { currentUser } from '@clerk/nextjs';

export async function getCurrentClerkUser() {
  try {
    const user = await currentUser();
    return user;
  } catch (error) {
    console.error('Error fetching Clerk user:', error);
    return null;
  }
}

export function getEmailFromClerkUser(user: any): string | null {
  const primaryEmail = user?.emailAddresses.find(
    (e: any) => e.id === user.primaryEmailAddressId
  );

  return primaryEmail?.emailAddress || null;
}

export function getUserDisplayName(user: any): string {
  if (user.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName}`;
  }
  
  if (user.firstName) {
    return user.firstName;
  }

  if (user.username) {
    return user.username;
  }

  return getEmailFromClerkUser(user) || 'User';
}
```

## Step 10: Create User Profile Component

Create `components/user/user-profile.tsx`:

```typescript
'use client';

import { UserButton } from '@clerk/nextjs';
import { useUser } from '@/components/providers/user-provider';

export function UserProfile() {
  const { user } = useUser();

  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <UserButton afterSignOutUrl="/sign-in" />
      {user && (
        <div className="flex flex-col">
          <span className="text-sm font-medium">{user.email}</span>
          {user.linkedin_profile_url && (
            <span className="text-xs text-muted-foreground">
              Profile connected
            </span>
          )}
        </div>
      )}
    </div>
  );
}
```

## Step 11: Customize Clerk Appearance

Create `lib/clerk/theme.ts`:

```typescript
export const clerkTheme = {
  variables: {
    colorPrimary: 'hsl(222.2 47.4% 11.2%)',
    colorDanger: 'hsl(0 84.2% 60.2%)',
    colorSuccess: 'hsl(142.1 76.2% 36.3%)',
    colorWarning: 'hsl(38 92% 50%)',
    colorTextOnPrimaryBackground: 'hsl(210 40% 98%)',
    colorBackground: 'hsl(222.2 84% 4.9%)',
    colorInputBackground: 'hsl(217.2 32.6% 17.5%)',
    colorInputText: 'hsl(210 40% 98%)',
  },
};
```

Update `app/layout.tsx` to use the theme:

```typescript
import { ClerkProvider } from '@clerk/nextjs';
import { dark } from '@clerk/themes';
import { clerkTheme } from '@/lib/clerk/theme';

// ... rest of imports

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      appearance={{
        baseTheme: dark,
        variables: clerkTheme.variables,
      }}
    >
      <html lang="en" className="dark">
        <body className={inter.className}>
          <UserProvider>
            {children}
          </UserProvider>
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  );
}
```

## Step 12: Create Sign Out Component

Create `components/user/sign-out-button.tsx`:

```typescript
'use client';

import { useClerk } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

export function SignOutButton() {
  const { signOut } = useClerk();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => signOut()}
      className="w-full justify-start"
    >
      <LogOut className="mr-2 h-4 w-4" />
      Sign out
    </Button>
  );
}
```

## Next Steps

Proceed to `08-CHAT-INTERFACE.md` for chat UI implementation.