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

