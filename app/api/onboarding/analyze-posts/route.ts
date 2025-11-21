import { auth } from '@clerk/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: NextRequest) {
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

