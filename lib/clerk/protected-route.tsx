import { auth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { ReactNode } from 'react';
import { createClient } from '@/lib/supabase/server';

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

