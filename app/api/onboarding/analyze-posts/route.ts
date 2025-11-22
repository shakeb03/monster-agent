import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import OpenAI from 'openai';
import { extractViralPatterns, saveViralPatterns } from '@/lib/viral/pattern-analyzer';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

async function analyzePostsInBackground(userId: string, userEmail: string) {
  console.log('[analyze-posts-bg] Starting background analysis for user:', userEmail);
  
  const supabase = createAdminClient();

  try {

    const { data: posts, error: postsError } = await supabase
      .from('linkedin_posts')
      .select('*')
      .eq('user_id', userId)
      .order('posted_at', { ascending: false });

    if (postsError || !posts || posts.length === 0) {
      console.error('[analyze-posts-bg] No posts found:', postsError);
      return;
    }

    console.log('[analyze-posts-bg] Found', posts.length, 'posts total');

    // Check which posts already have analysis
    const postIds = posts.map(p => p.id);
    const { data: existingAnalyses } = await supabase
      .from('post_analysis')
      .select('post_id')
      .in('post_id', postIds);

    const analyzedPostIds = new Set(existingAnalyses?.map(a => a.post_id) || []);
    
    // Filter to only posts that need analysis
    const postsToAnalyze = posts.filter(p => !analyzedPostIds.has(p.id));

    console.log('[analyze-posts-bg] Already analyzed:', analyzedPostIds.size);
    console.log('[analyze-posts-bg] Need to analyze:', postsToAnalyze.length);

    if (postsToAnalyze.length === 0) {
      console.log('[analyze-posts-bg] All posts already analyzed, skipping');
      return;
    }

    // Analyze only posts that need analysis
    for (const post of postsToAnalyze) {
      const analysisPrompt = `Analyze this LinkedIn post and provide detailed insights:

Post Text: ${post.post_text}
Likes: ${post.likes_count}
Comments: ${post.comments_count}
Shares: ${post.shares_count}
Engagement Rate: ${post.engagement_rate}%

Provide analysis in the following JSON format:
{
  "tone": "professional/casual/inspirational/educational/etc",
  "topics": ["topic1", "topic2", "topic3"],
  "hook_analysis": "Analysis of the opening hook and its effectiveness",
  "engagement_analysis": "Why this post did or didn't perform well",
  "what_worked": "Specific elements that contributed to success",
  "what_didnt_work": "Areas for improvement"
}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert LinkedIn content analyst. Provide detailed, actionable insights in JSON format.',
          },
          {
            role: 'user',
            content: analysisPrompt,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const analysis = JSON.parse(response.choices[0].message.content || '{}');

      console.log('[analyze-posts-bg] Analyzed post', post.id, '- Tone:', analysis.tone);

      // Extract time from post.posted_at if available
      let postingTime = null;
      if (post.posted_at) {
        try {
          const date = new Date(post.posted_at);
          postingTime = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        } catch (error) {
          console.log('[analyze-posts-bg] Could not extract time from posted_at:', error);
        }
      }

      // Save post analysis
      const { error: insertError } = await supabase
        .from('post_analysis')
        .insert({
          user_id: userId,
          post_id: post.id,
          tone: analysis.tone,
          topics: analysis.topics || [],
          hook_analysis: analysis.hook_analysis,
          engagement_analysis: analysis.engagement_analysis,
          what_worked: analysis.what_worked,
          what_didnt_work: analysis.what_didnt_work,
          posting_time: postingTime,
          analysis_status: 'completed',
          raw_analysis: analysis,
        });

      if (insertError) {
        console.error('[analyze-posts-bg] Error inserting analysis for post', post.id, ':', insertError);
      } else {
        console.log('[analyze-posts-bg] ✓ Saved analysis for post', post.id);
      }
    }

    console.log('[analyze-posts-bg] Completed analysis for', postsToAnalyze.length, 'new posts');

    // Generate overall voice analysis
    const voiceAnalysisPrompt = `Based on these ${posts.length} LinkedIn posts, create a comprehensive voice and style profile:

${posts.slice(0, 20).map((p, i) => `Post ${i + 1}: ${p.post_text}\nEngagement: ${p.engagement_rate}%\n`).join('\n')}

Provide analysis in the following JSON format:
{
  "overall_tone": "Description of overall tone",
  "writing_style": "Description of writing style and patterns",
  "common_topics": ["topic1", "topic2", "topic3"],
  "posting_patterns": {
    "frequency": "Description",
    "best_times": ["time1", "time2"],
    "post_length": "Short/Medium/Long"
  },
  "engagement_patterns": {
    "high_performers": "What drives high engagement",
    "low_performers": "What hurts engagement"
  },
  "strengths": ["strength1", "strength2", "strength3"],
  "weaknesses": ["weakness1", "weakness2"],
  "top_performing_elements": ["element1", "element2", "element3"],
  "recommendations": ["rec1", "rec2", "rec3"],
  "analysis_summary": "2-3 sentence summary of their LinkedIn voice"
}`;

    const voiceResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert LinkedIn content strategist. Create a detailed voice profile.',
        },
        {
          role: 'user',
          content: voiceAnalysisPrompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const voiceAnalysis = JSON.parse(voiceResponse.choices[0].message.content || '{}');

    console.log('[analyze-posts-bg] Saving voice analysis');

    // Save voice analysis
    const { error: voiceError } = await supabase
      .from('voice_analysis')
      .upsert({
        user_id: userId,
        overall_tone: voiceAnalysis.overall_tone,
        writing_style: voiceAnalysis.writing_style,
        common_topics: voiceAnalysis.common_topics || [],
        posting_patterns: voiceAnalysis.posting_patterns,
        engagement_patterns: voiceAnalysis.engagement_patterns,
        strengths: voiceAnalysis.strengths || [],
        weaknesses: voiceAnalysis.weaknesses || [],
        top_performing_elements: voiceAnalysis.top_performing_elements || [],
        recommendations: voiceAnalysis.recommendations || [],
        analysis_summary: voiceAnalysis.analysis_summary,
      });

    if (voiceError) {
      console.error('[analyze-posts-bg] Error saving voice analysis:', voiceError);
    } else {
      console.log('[analyze-posts-bg] ✓ Saved voice analysis');
    }

    // Extract viral patterns from top posts
    const topPosts = posts
      .filter(p => p.engagement_rate && p.engagement_rate > 5)
      .sort((a, b) => (b.engagement_rate || 0) - (a.engagement_rate || 0))
      .slice(0, 10);

    if (topPosts.length > 0) {
      console.log('[analyze-posts-bg] Extracting viral patterns from', topPosts.length, 'top posts');
      
      // Get post analysis for top posts
      const { data: postAnalyses } = await supabase
        .from('post_analysis')
        .select('*')
        .in('post_id', topPosts.map(p => p.id));

      // Merge post data with analysis
      const postsWithAnalysis = topPosts.map(post => {
        const analysis = postAnalyses?.find(a => a.post_id === post.id);
        return {
          ...post,
          post_analysis: analysis,
        };
      });

      const viralPatterns = await extractViralPatterns(userId, postsWithAnalysis);
      await saveViralPatterns(userId, viralPatterns);
      
      console.log('[analyze-posts-bg] ✓ Saved', viralPatterns.length, 'viral patterns');
    }

    console.log('[analyze-posts-bg] ✅ Background analysis completed successfully');
  } catch (error) {
    console.error('[analyze-posts-bg] ❌ Background analysis error:', error);
  }
}

export async function POST() {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
      console.error('[analyze-posts] User not found for clerk_user_id:', userId, userError);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    console.log('[analyze-posts] Triggering background analysis for user:', user.email);

    // Trigger analysis in background (don't await)
    analyzePostsInBackground(user.id, user.email).catch((error) => {
      console.error('[analyze-posts] Background process error:', error);
    });

    // Return immediately
    return NextResponse.json({
      success: true,
      message: 'Analysis started in background',
      status: 'processing',
    });
  } catch (error) {
    console.error('[analyze-posts] API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
