import { createClient } from '@/lib/supabase/server';
import type { OnboardingStatus } from '@/types/database';

export async function getUserOnboardingStatus(
  clerkUserId: string
): Promise<OnboardingStatus> {
  const supabase = await createClient();

  const { data: user } = await supabase
    .from('users')
    .select('onboarding_status')
    .eq('clerk_user_id', clerkUserId)
    .single();

  return user?.onboarding_status || 'pending';
}

export function isOnboardingComplete(status: OnboardingStatus): boolean {
  return status === 'completed';
}

export function getNextOnboardingStep(
  status: OnboardingStatus
): 'profile' | 'posts' | 'goals' | 'analysis' | null {
  switch (status) {
    case 'pending':
      return 'profile';
    case 'profile_fetched':
      return 'posts';
    case 'posts_fetched':
      return 'goals';
    case 'analyzed':
      return 'analysis';
    case 'completed':
      return null;
    default:
      return 'profile';
  }
}

