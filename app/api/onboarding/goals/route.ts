import { auth } from '@clerk/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const { userId } = auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { goals }: { goals: string[] } = await req.json();

    if (!goals || !Array.isArray(goals)) {
      return NextResponse.json({ error: 'Goals must be an array' }, { status: 400 });
    }

    const supabase = await createClient();

    // Get user from database
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_user_id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Update user goals and complete onboarding
    const { error: updateError } = await supabase
      .from('users')
      .update({
        goals,
        onboarding_status: 'completed',
      })
      .eq('id', user.id);

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to save goals' },
        { status: 500 }
      );
    }

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

