import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

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
    const clerkUser = await currentUser();
    
    if (!clerkUser) {
      console.error('Failed to get Clerk user');
      redirect('/sign-in');
    }

    const email = clerkUser.emailAddresses.find(
      (e) => e.id === clerkUser.primaryEmailAddressId
    )?.emailAddress || '';

    console.log('Creating user in Supabase:', { userId, email });

    // Use admin client to bypass RLS for user creation
    const adminClient = createAdminClient();
    const { data: newUser, error } = await adminClient.from('users').insert({
      clerk_user_id: userId,
      email,
      onboarding_status: 'pending',
    }).select().single();

    if (error) {
      // If user already exists (duplicate key), fetch it instead
      if (error.code === '23505') {
        console.log('User already exists, fetching...');
        const { data: existingUser } = await adminClient
          .from('users')
          .select('*')
          .eq('clerk_user_id', userId)
          .single();
        
        if (existingUser) {
          console.log('Fetched existing user:', existingUser);
        }
        // Continue without error - user exists
      } else {
        console.error('Failed to create user in Supabase:', error);
        throw new Error(`Failed to create user: ${error.message}`);
      }
    } else {
      console.log('User created successfully:', newUser);
    }
  }

  return (
    <div className="flex h-screen w-full bg-background">
      {children}
    </div>
  );
}

