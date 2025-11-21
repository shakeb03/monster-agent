import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      postContent,
      actualEngagement,
      userFeedback,
    }: {
      postContent: string;
      actualEngagement: number;
      userFeedback: 'loved' | 'okay' | 'disliked';
    } = await req.json();

    const supabase = createAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_user_id', userId)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Analyze what worked or didn't
    const analysis = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Analyze why this LinkedIn post performed the way it did.',
        },
        {
          role: 'user',
          content: `Post: ${postContent}
Engagement: ${actualEngagement}%
User Feedback: ${userFeedback}

Extract learnings:
1. What specific elements drove or hurt performance?
2. Which patterns should be reinforced or avoided?
3. New patterns discovered?

Return JSON with actionable insights.`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    const learnings = JSON.parse(analysis.choices[0].message.content || '{}');

    // Update pattern scores based on feedback
    if (userFeedback === 'loved' && actualEngagement > 5) {
      // Get patterns used in this post
      const { data: performance } = await supabase
        .from('post_performance')
        .select('patterns_used')
        .eq('post_content', postContent)
        .single();

      if (performance && performance.patterns_used) {
        // Boost success rate of patterns used
        for (const patternId of performance.patterns_used) {
          const { data: pattern } = await supabase
            .from('viral_patterns')
            .select('success_rate, times_used')
            .eq('id', patternId)
            .single();

          if (pattern) {
            const newSuccessRate = Math.min(
              100,
              (pattern.success_rate || 0) + 5
            );
            
            await supabase
              .from('viral_patterns')
              .update({
                success_rate: newSuccessRate,
                times_used: (pattern.times_used || 0) + 1,
                last_used_at: new Date().toISOString(),
              })
              .eq('id', patternId);
          }
        }
      }
    }

    // Store feedback
    await supabase.from('post_performance').insert({
      user_id: user.id,
      post_content: postContent,
      actual_engagement: actualEngagement,
      learnings: JSON.stringify(learnings),
      outperformed: actualEngagement > 5,
      measured_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, learnings });
  } catch (error) {
    console.error('Feedback processing error:', error);
    return NextResponse.json({ error: 'Failed to process feedback' }, { status: 500 });
  }
}

