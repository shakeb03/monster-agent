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

