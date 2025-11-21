import { auth } from '@clerk/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateEmbedding } from '@/lib/openai/embeddings';

export async function POST(req: NextRequest) {
  try {
    const { userId } = auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { profileUrl }: { profileUrl: string } = await req.json();

    if (!profileUrl) {
      return NextResponse.json({ error: 'Profile URL is required' }, { status: 400 });
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

    // Call Apify LinkedIn Posts API
    const apifyResponse = await fetch(
      `https://api.apify.com/v2/acts/supreme_coder~linkedin-post/run-sync-get-dataset-items?token=${process.env.APIFY_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileUrl: profileUrl,
          maxPosts: 50, // Fetch last 50 posts
        }),
      }
    );

    if (!apifyResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch LinkedIn posts' },
        { status: 500 }
      );
    }

    const postsData = await apifyResponse.json();

    if (!postsData || postsData.length === 0) {
      return NextResponse.json(
        { error: 'No posts found' },
        { status: 404 }
      );
    }

    // Process and save posts with embeddings
    const savedPosts = [];
    
    for (const post of postsData) {
      const postText = post.text || post.content || '';
      
      // Generate embedding for post text
      const embedding = await generateEmbedding(postText);

      // Calculate engagement rate
      const totalEngagement = 
        (post.likes || 0) + 
        (post.comments || 0) + 
        (post.shares || 0);
      
      const engagementRate = totalEngagement > 0 
        ? ((totalEngagement / (post.impressions || 1)) * 100).toFixed(2)
        : null;

      const { data: savedPost, error: postError } = await supabase
        .from('linkedin_posts')
        .insert({
          user_id: user.id,
          post_url: post.url || post.postUrl,
          post_text: postText,
          posted_at: post.postedAt || post.timestamp,
          likes_count: post.likes || 0,
          comments_count: post.comments || 0,
          shares_count: post.shares || 0,
          engagement_rate: engagementRate,
          raw_data: post,
          embedding,
        })
        .select()
        .single();

      if (!postError && savedPost) {
        savedPosts.push(savedPost);
      }
    }

    // Update user onboarding status
    await supabase
      .from('users')
      .update({
        onboarding_status: 'posts_fetched',
      })
      .eq('id', user.id);

    return NextResponse.json({
      success: true,
      postsCount: savedPosts.length,
    });
  } catch (error) {
    console.error('LinkedIn posts fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

