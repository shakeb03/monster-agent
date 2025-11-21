import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import OpenAI from 'openai';
import { buildViralPrompt, getViralPromptContext } from '@/lib/viral/prompt-builder';
import { analyzeUserIntent, getRelevantContext } from '@/lib/viral/context-retriever';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { message } = await req.json();

    const supabase = createAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_user_id', userId)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Step 1: Analyze intent (50 tokens)
    const intent = await analyzeUserIntent(message);

    // Step 2: Get only relevant context (500-800 tokens vs 10k+)
    const relevantContext = await getRelevantContext(user.id, intent);

    // Step 3: Build optimized prompt
    const promptContext = await getViralPromptContext(user.id);
    const systemPrompt = await buildViralPrompt(user.id, promptContext);

    // Step 4: Generate viral content
    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // Use GPT-4o (Claude not available via OpenAI SDK)
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Request: ${message}

Relevant patterns to use:
${relevantContext.patterns.map(p => `- ${p.pattern_description}`).join('\n')}

Top performing examples:
${relevantContext.examples.map(e => `Hook: "${e.hook}" (${e.engagement}% engagement)`).join('\n')}

Generate 3 variations following proven formulas.`,
        },
      ],
      temperature: 0.8,
      max_tokens: 2000,
    });

    const generatedContent = response.choices[0].message.content;

    // Step 5: Store for learning
    await supabase.from('post_performance').insert({
      user_id: user.id,
      post_content: generatedContent || '',
      predicted_engagement: null, // Will be updated with user selection
      patterns_used: relevantContext.patterns.map(p => p.id),
    });

    return NextResponse.json({
      success: true,
      content: generatedContent,
      patternsUsed: relevantContext.patterns.length,
      contextTokens: relevantContext.totalTokens,
    });
  } catch (error) {
    console.error('Viral generation error:', error);
    return NextResponse.json({ error: 'Failed to generate content' }, { status: 500 });
  }
}

