import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import OnboardingChat from '@/components/onboarding/onboarding-chat';
import ChatInterface from '@/components/chat/chat-interface';

export default async function ChatPage() {
  const { userId } = await auth();

  console.log('[ChatPage] userId:', userId);

  if (!userId) {
    console.log('[ChatPage] No userId, redirecting to sign-in');
    redirect('/sign-in');
  }

  // Use admin client to bypass RLS
  const supabase = createAdminClient();

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('clerk_user_id', userId)
    .single();

  console.log('[ChatPage] User from DB:', user);

  if (!user) {
    console.log('[ChatPage] No user in DB, redirecting to sign-in');
    redirect('/sign-in');
  }

  // Check onboarding status
  const needsOnboarding = user.onboarding_status !== 'completed';

  console.log('[ChatPage] User onboarding status:', user.onboarding_status);
  console.log('[ChatPage] Needs onboarding:', needsOnboarding);

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

