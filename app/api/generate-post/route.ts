import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateStrictAuthenticContent } from '@/lib/agent/strict-generator';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { topic } = await req.json();

    // Use admin client to get user ID
    const supabase = createAdminClient();
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_user_id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    console.log('[generate-post] Calling strict generator for user:', user.id);

    // Skip agent, go directly to strict generator
    const result = await generateStrictAuthenticContent(user.id, topic);

    console.log('[generate-post] Success! Score:', result.validation.score);

    return NextResponse.json({
      success: true,
      post: result.post,
      validation: result.validation,
      sourceData: result.sourceData,
    });
  } catch (error) {
    console.error('[generate-post] Error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Internal server error',
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

