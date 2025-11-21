import { auth } from '@clerk/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateEmbedding } from '@/lib/openai/embeddings';
import { apifyClient } from '@/lib/apify/client';
import { processLinkedInPost, validateLinkedInUrl, normalizeLinkedInUrl } from '@/lib/apify/processors';
import { withRetry } from '@/lib/apify/retry';
import { handleApifyError } from '@/lib/apify/errors';

export async function POST(req: NextRequest) {
  try {
    const { userId } = auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { profileUrl }: { profileUrl: string } = await req.json();

    // Validate URL
    if (!validateLinkedInUrl(profileUrl)) {
      return NextResponse.json(
        { error: 'Invalid LinkedIn profile URL' },
        { status: 400 }
      );
    }

    const normalizedUrl = normalizeLinkedInUrl(profileUrl);

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

    // Fetch with retry logic
    const result = await withRetry(
      () => apifyClient.fetchLinkedInPosts(normalizedUrl, 50),
      { maxRetries: 2 }
    );

    if (!result.success || !result.data || result.data.length === 0) {
      return NextResponse.json(
        { error: result.error || 'No posts found' },
        { status: 404 }
      );
    }

    // Process and save posts with embeddings
    const savedPosts = [];
    
    for (const rawPost of result.data) {
      const processedPost = processLinkedInPost(rawPost);
      
      // Generate embedding for post text
      const embedding = await generateEmbedding(processedPost.postText);

      const { data: savedPost, error: postError } = await supabase
        .from('linkedin_posts')
        .insert({
          user_id: user.id,
          post_url: processedPost.postUrl,
          post_text: processedPost.postText,
          posted_at: processedPost.postedAt,
          likes_count: processedPost.likesCount,
          comments_count: processedPost.commentsCount,
          shares_count: processedPost.sharesCount,
          engagement_rate: processedPost.engagementRate,
          raw_data: rawPost,
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
    const apifyError = handleApifyError(error);
    console.error('LinkedIn posts fetch error:', apifyError);
    
    return NextResponse.json(
      { error: apifyError.message },
      { status: apifyError.statusCode || 500 }
    );
  }
}

