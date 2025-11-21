import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import OpenAI from 'openai';
import { extractViralPatterns, saveViralPatterns } from '@/lib/viral/pattern-analyzer';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: NextRequest) {
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

    console.log('[analyze-posts] Starting analysis for user:', user.email);

    // Get all posts for the user
    const { data: posts, error: postsError } = await supabase
      .from('linkedin_posts')
      .select('*')
      .eq('user_id', user.id)
      .order('posted_at', { ascending: false });

    if (postsError || !posts || posts.length === 0) {
      return NextResponse.json(
        { error: 'No posts found to analyze' },
        { status: 404 }
      );
    }

    // Analyze each post individually
    for (const post of posts) {
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
  "what_didnt_work": "Areas for improvement",
  "posting_time": "HH:MM format of when posted"
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

      // Save post analysis
      await supabase
        .from('post_analysis')
        .insert({
          user_id: user.id,
          post_id: post.id,
          tone: analysis.tone,
          topics: analysis.topics || [],
          hook_analysis: analysis.hook_analysis,
          engagement_analysis: analysis.engagement_analysis,
          what_worked: analysis.what_worked,
          what_didnt_work: analysis.what_didnt_work,
          posting_time: analysis.posting_time,
          analysis_status: 'completed',
          raw_analysis: analysis,
        });
    }

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

    // Save voice analysis
    await supabase
      .from('voice_analysis')
      .upsert({
        user_id: user.id,
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

    // Extract viral patterns from top posts
    const topPosts = posts
      .filter(p => p.engagement_rate && p.engagement_rate > 5)
      .sort((a, b) => (b.engagement_rate || 0) - (a.engagement_rate || 0))
      .slice(0, 10);

    if (topPosts.length > 0) {
      console.log('[analyze-posts] Extracting viral patterns from', topPosts.length, 'top posts');
      
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

      const viralPatterns = await extractViralPatterns(user.id, postsWithAnalysis);
      await saveViralPatterns(user.id, viralPatterns);
      
      console.log('[analyze-posts] Saved', viralPatterns.length, 'viral patterns');
    }

    // Update user onboarding status
    await supabase
      .from('users')
      .update({
        onboarding_status: 'analyzed',
      })
      .eq('id', user.id);

    return NextResponse.json({
      success: true,
      postsAnalyzed: posts.length,
    });
  } catch (error) {
    console.error('Post analysis error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

