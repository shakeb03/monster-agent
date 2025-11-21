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

