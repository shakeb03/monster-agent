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

