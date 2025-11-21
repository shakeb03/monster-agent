import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateEmbedding } from '@/lib/openai/embeddings';
import { apifyClient } from '@/lib/apify/client';
import { processLinkedInPost, validateLinkedInUrl, normalizeLinkedInUrl } from '@/lib/apify/processors';
import { withRetry } from '@/lib/apify/retry';
import { handleApifyError } from '@/lib/apify/errors';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    
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

    // Use admin client to bypass RLS
    const supabase = createAdminClient();

    // Get user from database
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_user_id', userId)
      .single();

    if (userError || !user) {
      console.error('[linkedin-posts] User not found for clerk_user_id:', userId, userError);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    console.log('[linkedin-posts] Fetching posts for:', normalizedUrl);

    // Fetch with retry logic
    const result = await withRetry(
      () => apifyClient.fetchLinkedInPosts(normalizedUrl, 50),
      { maxRetries: 2 }
    );

    if (!result.success || !result.data || result.data.length === 0) {
      console.error('[linkedin-posts] No posts found:', result.error);
      return NextResponse.json(
        { error: result.error || 'No posts found' },
        { status: 404 }
      );
    }

    console.log(`[linkedin-posts] Fetched ${result.data.length} posts, processing...`);

    // Process and save posts with embeddings
    const savedPosts = [];
    
    for (let i = 0; i < result.data.length; i++) {
      const rawPost = result.data[i];
      console.log(`[linkedin-posts] Processing post ${i + 1}/${result.data.length}...`);
      
      try {
        const processedPost = processLinkedInPost(rawPost);
        console.log(`[linkedin-posts] Processed post data:`, {
          postUrl: processedPost.postUrl,
          postTextLength: processedPost.postText?.length || 0,
          postedAt: processedPost.postedAt,
          likesCount: processedPost.likesCount,
        });
        
        // Skip posts without text
        if (!processedPost.postText || processedPost.postText.trim().length === 0) {
          console.log(`[linkedin-posts] Skipping post ${i + 1} - no text content`);
          continue;
        }
        
        // Generate embedding for post text
        console.log(`[linkedin-posts] Generating embedding for post ${i + 1}...`);
        const embedding = await generateEmbedding(processedPost.postText);
        console.log(`[linkedin-posts] Embedding generated for post ${i + 1}`);

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

        if (postError) {
          console.error(`[linkedin-posts] Error saving post ${i + 1}:`, postError);
        } else if (savedPost) {
          console.log(`[linkedin-posts] Post ${i + 1} saved successfully`);
          savedPosts.push(savedPost);
        }
      } catch (error) {
        console.error(`[linkedin-posts] Error processing post ${i + 1}:`, error);
      }
    }

    console.log(`[linkedin-posts] Saved ${savedPosts.length} posts, updating user status...`);

    // Update user onboarding status
    const { error: updateError } = await supabase
      .from('users')
      .update({
        onboarding_status: 'posts_fetched',
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('[linkedin-posts] Error updating user status:', updateError);
    }

    console.log('[linkedin-posts] Success!');

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

