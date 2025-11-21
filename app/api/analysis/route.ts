import { auth } from '@clerk/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const { userId } = auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    // Get voice analysis
    const { data: voiceAnalysis } = await supabase
      .from('voice_analysis')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Get top performing posts
    const { data: topPosts } = await supabase
      .from('linkedin_posts')
      .select('*, post_analysis(*)')
      .eq('user_id', user.id)
      .order('engagement_rate', { ascending: false })
      .limit(5);

    // Get posting patterns
    const { data: allPosts } = await supabase
      .from('linkedin_posts')
      .select('posted_at, engagement_rate')
      .eq('user_id', user.id);

    return NextResponse.json({
      voiceAnalysis,
      topPosts,
      postingStats: {
        totalPosts: allPosts?.length || 0,
        averageEngagement: allPosts
          ? (allPosts.reduce((sum, p) => sum + (p.engagement_rate || 0), 0) / allPosts.length).toFixed(2)
          : 0,
      },
    });
  } catch (error) {
    console.error('Analysis fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

