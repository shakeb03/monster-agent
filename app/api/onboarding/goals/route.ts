import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { goals }: { goals: string[] } = await req.json();

    if (!goals || !Array.isArray(goals)) {
      return NextResponse.json({ error: 'Goals must be an array' }, { status: 400 });
    }

    // Use admin client to bypass RLS
    const supabase = createAdminClient();

    // Get user from database
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_user_id', userId)
      .single();

    if (userError || !user) {
      console.error('[goals] User not found for clerk_user_id:', userId, userError);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    console.log('[goals] Saving goals for user:', user.email);

    // Update user goals and complete onboarding
    const { error: updateError } = await supabase
      .from('users')
      .update({
        goals,
        onboarding_status: 'completed',
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('[goals] Error updating user:', updateError);
      return NextResponse.json(
        { error: 'Failed to save goals' },
        { status: 500 }
      );
    }

    console.log('[goals] Success! Onboarding completed.');

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('Goals save error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

