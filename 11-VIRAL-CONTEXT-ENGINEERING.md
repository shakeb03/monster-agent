# 11-VIRAL-CONTEXT-ENGINEERING.md - Implementation Guide

## Overview

This document implements Anthropic's context engineering principles to create LinkedIn posts with consistently high viral potential.

---

## Step 1: Add Viral Patterns Table to Database

Run this SQL in Supabase:

```sql
-- Viral patterns tracking
CREATE TABLE viral_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pattern_type TEXT NOT NULL CHECK (pattern_type IN ('hook', 'format', 'cta', 'topic', 'timing', 'emotion')),
    pattern_description TEXT NOT NULL,
    success_rate DECIMAL(5,2) DEFAULT 0,
    example_post_ids TEXT[] DEFAULT '{}',
    times_used INTEGER DEFAULT 0,
    avg_engagement DECIMAL(5,2) DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_viral_patterns_user_id ON viral_patterns(user_id);
CREATE INDEX idx_viral_patterns_success ON viral_patterns(user_id, success_rate DESC);
CREATE INDEX idx_viral_patterns_type ON viral_patterns(pattern_type);

-- Post performance tracking
CREATE TABLE post_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_content TEXT NOT NULL,
    predicted_engagement DECIMAL(5,2),
    actual_engagement DECIMAL(5,2),
    patterns_used TEXT[],
    posted_at TIMESTAMPTZ,
    measured_at TIMESTAMPTZ,
    outperformed BOOLEAN,
    learnings TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_post_performance_user_id ON post_performance(user_id, created_at DESC);
CREATE INDEX idx_post_performance_outperformed ON post_performance(user_id, outperformed);

-- Trigger for updated_at
CREATE TRIGGER update_viral_patterns_updated_at BEFORE UPDATE ON viral_patterns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## Step 2: Create Viral Pattern Analyzer

Create `lib/viral/pattern-analyzer.ts`:

```typescript
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

interface ViralPattern {
  type: 'hook' | 'format' | 'cta' | 'topic' | 'timing' | 'emotion';
  description: string;
  examples: string[];
  successRate: number;
}

export async function extractViralPatterns(
  userId: string,
  topPosts: any[]
): Promise<ViralPattern[]> {
  const prompt = `Analyze these high-performing LinkedIn posts and extract SPECIFIC, REUSABLE patterns that drove their success.

TOP POSTS:
${topPosts.map((p, i) => `
POST ${i + 1} (${p.engagement_rate}% engagement):
${p.post_text}

Analysis: ${p.post_analysis?.what_worked || 'N/A'}
---
`).join('\n')}

Extract patterns in these categories:
1. HOOK PATTERNS: Specific opening formulas that grab attention
2. FORMAT PATTERNS: Structure and visual presentation
3. CTA PATTERNS: How calls-to-action are phrased
4. TOPIC PATTERNS: Subject matter that resonates
5. TIMING PATTERNS: When posts perform best
6. EMOTION PATTERNS: Emotional triggers that work

For each pattern:
- Be SPECIFIC (not "use questions" but "open with 'What if...' questions")
- Include WHY it works based on engagement data
- Note frequency in top posts

Return JSON array of patterns.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are an expert at identifying viral content patterns from data.',
      },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const result = JSON.parse(response.choices[0].message.content || '{"patterns":[]}');
  return result.patterns || [];
}

export async function saveViralPatterns(
  userId: string,
  patterns: ViralPattern[]
): Promise<void> {
  const supabase = await createClient();

  for (const pattern of patterns) {
    await supabase.from('viral_patterns').upsert({
      user_id: userId,
      pattern_type: pattern.type,
      pattern_description: pattern.description,
      success_rate: pattern.successRate,
      example_post_ids: [],
      metadata: { examples: pattern.examples },
    });
  }
}

export async function getTopViralPatterns(
  userId: string,
  limit = 10
): Promise<any[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('viral_patterns')
    .select('*')
    .eq('user_id', userId)
    .order('success_rate', { ascending: false })
    .limit(limit);

  return data || [];
}
```

---

## Step 3: Build Dynamic Viral Prompt System

Create `lib/viral/prompt-builder.ts`:

```typescript
import { createClient } from '@/lib/supabase/server';

interface ViralPromptContext {
  voiceAnalysis: any;
  topPatterns: any[];
  recentFeedback: any[];
  userGoals: string[];
}

export async function buildViralPrompt(
  userId: string,
  context: ViralPromptContext
): Promise<string> {
  const { voiceAnalysis, topPatterns, recentFeedback, userGoals } = context;

  // Extract only the most critical information
  const hookPatterns = topPatterns
    .filter(p => p.pattern_type === 'hook')
    .slice(0, 3)
    .map(p => p.pattern_description);

  const emotionTriggers = topPatterns
    .filter(p => p.pattern_type === 'emotion')
    .slice(0, 3)
    .map(p => p.pattern_description);

  const formatRules = topPatterns
    .filter(p => p.pattern_type === 'format')
    .slice(0, 2)
    .map(p => p.pattern_description);

  return `You are a LinkedIn content strategist specializing in creating viral, high-engagement posts for this specific user.

## USER VOICE (Proven from Data)
Tone: ${voiceAnalysis?.overall_tone || 'professional'}
Style: ${voiceAnalysis?.writing_style || 'clear and direct'}
Core Topics: ${voiceAnalysis?.common_topics?.slice(0, 5).join(', ') || 'general business'}

## PROVEN VIRAL HOOKS (Use These Formulas)
${hookPatterns.map((h, i) => `${i + 1}. ${h}`).join('\n') || '1. Start with a bold statement or question'}

## EMOTIONAL TRIGGERS THAT WORK
${emotionTriggers.map((e, i) => `${i + 1}. ${e}`).join('\n') || '1. Curiosity and surprise'}

## FORMAT RULES (Non-Negotiable)
${formatRules.map((f, i) => `${i + 1}. ${f}`).join('\n') || '1. Use line breaks for readability'}

## RECENT USER FEEDBACK
${recentFeedback.slice(0, 3).map(f => `- ${f.feedback}`).join('\n') || 'No recent feedback'}

## USER GOALS
${userGoals.map((g, i) => `${i + 1}. ${g}`).join('\n')}

## YOUR MANDATE
1. Every post MUST use at least one proven viral hook formula
2. Every post MUST activate proven emotional triggers
3. Every post MUST follow format rules exactly
4. NEVER be generic - always specific, bold, and engaging
5. Aim for top 10% engagement based on user's historical data

## OUTPUT FORMAT
For each request:
1. Generate 3 post variations (different hooks, same message)
2. For each variation, specify:
   - Which viral pattern(s) used
   - Expected engagement score (1-10)
   - Why it will perform well
   - Suggested posting time
3. Recommend the best variation with reasoning

Be direct, specific, and data-driven. Generic advice fails.`;
}

export async function getViralPromptContext(
  userId: string
): Promise<ViralPromptContext> {
  const supabase = await createClient();

  // Voice analysis
  const { data: voiceAnalysis } = await supabase
    .from('voice_analysis')
    .select('*')
    .eq('user_id', userId)
    .single();

  // Top patterns
  const { data: topPatterns } = await supabase
    .from('viral_patterns')
    .select('*')
    .eq('user_id', userId)
    .order('success_rate', { ascending: false })
    .limit(10);

  // User goals
  const { data: user } = await supabase
    .from('users')
    .select('goals')
    .eq('id', userId)
    .single();

  return {
    voiceAnalysis,
    topPatterns: topPatterns || [],
    recentFeedback: [],
    userGoals: user?.goals || [],
  };
}
```

---

## Step 4: Implement Smart Context Retrieval

Create `lib/viral/context-retriever.ts`:

```typescript
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

interface IntentAnalysis {
  topic: string;
  goal: string;
  tone: string;
  relevantPatternTypes: string[];
}

export async function analyzeUserIntent(
  message: string
): Promise<IntentAnalysis> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'Extract structured intent from user message about LinkedIn content.',
      },
      {
        role: 'user',
        content: `Analyze: "${message}"
        
Return JSON with:
- topic: main subject
- goal: what user wants to achieve
- tone: desired tone
- relevantPatternTypes: array of relevant pattern types (hook, format, cta, topic, emotion)`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  return JSON.parse(response.choices[0].message.content || '{}');
}

export async function getRelevantContext(
  userId: string,
  intent: IntentAnalysis
) {
  const supabase = await createClient();

  // Get only relevant patterns (not all)
  const { data: patterns } = await supabase
    .from('viral_patterns')
    .select('*')
    .eq('user_id', userId)
    .in('pattern_type', intent.relevantPatternTypes)
    .order('success_rate', { ascending: false })
    .limit(5);

  // Get only 2-3 relevant example posts (not 50)
  const { data: examplePosts } = await supabase
    .from('linkedin_posts')
    .select('id, post_text, engagement_rate, post_analysis(what_worked, hook_analysis)')
    .eq('user_id', userId)
    .gte('engagement_rate', 5) // Only high-performers
    .order('engagement_rate', { ascending: false })
    .limit(3);

  return {
    patterns: patterns || [],
    examples: examplePosts?.map(p => ({
      hook: p.post_text.split('\n')[0],
      engagement: p.engagement_rate,
      why_worked: p.post_analysis?.what_worked,
    })) || [],
    totalTokens: estimateTokens(patterns, examplePosts),
  };
}

function estimateTokens(patterns: any[], posts: any[]): number {
  const patternTokens = patterns.reduce(
    (sum, p) => sum + Math.ceil(p.pattern_description.length / 4),
    0
  );
  const postTokens = posts.reduce(
    (sum, p) => sum + Math.ceil(p.post_text.length / 4),
    0
  );
  return patternTokens + postTokens;
}
```

---

## Step 5: Create Viral Content Generation API

Create `app/api/viral/generate/route.ts`:

```typescript
import { auth } from '@clerk/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import { buildViralPrompt, getViralPromptContext } from '@/lib/viral/prompt-builder';
import { analyzeUserIntent, getRelevantContext } from '@/lib/viral/context-retriever';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { message } = await req.json();

    const supabase = await createClient();
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
      model: 'claude-sonnet-4-20250514', // Use Claude Sonnet 4
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
```

---

## Step 6: Add Pattern Extraction to Onboarding

Update `app/api/onboarding/analyze-posts/route.ts`:

Add after voice analysis:

```typescript
// Extract viral patterns from top posts
import { extractViralPatterns, saveViralPatterns } from '@/lib/viral/pattern-analyzer';

const topPosts = posts
  .filter(p => p.engagement_rate && p.engagement_rate > 5)
  .sort((a, b) => (b.engagement_rate || 0) - (a.engagement_rate || 0))
  .slice(0, 10);

const viralPatterns = await extractViralPatterns(user.id, topPosts);
await saveViralPatterns(user.id, viralPatterns);
```

---

## Step 7: Create Pattern Learning from Feedback

Create `app/api/viral/feedback/route.ts`:

```typescript
import { auth } from '@clerk/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: NextRequest) {
  try {
    const { userId } = auth();
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

    const supabase = await createClient();
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

    // Update pattern scores
    if (userFeedback === 'loved' && actualEngagement > 5) {
      // Boost patterns used
      await supabase.rpc('increment_pattern_success', {
        p_user_id: user.id,
        p_boost_amount: 0.5,
      });
    }

    // Store feedback
    await supabase.from('post_performance').insert({
      user_id: user.id,
      post_content: postContent,
      actual_engagement: actualEngagement,
      learnings: JSON.stringify(learnings),
      outperformed: actualEngagement > 5,
    });

    return NextResponse.json({ success: true, learnings });
  } catch (error) {
    console.error('Feedback processing error:', error);
    return NextResponse.json({ error: 'Failed to process feedback' }, { status: 500 });
  }
}
```

---

## Step 8: Implement Aggressive Context Compaction

Update `lib/context/manager.ts`:

```typescript
// Replace getContextForChat with viral-optimized version

export async function getViralOptimizedContext(
  userId: string,
  chatId: string,
  chatType: 'standard' | 'new_perspective'
): Promise<ChatContext> {
  const supabase = await createClient();

  // 1. Voice summary (200 tokens max)
  const { data: voiceAnalysis } = await supabase
    .from('voice_analysis')
    .select('overall_tone, writing_style, common_topics, analysis_summary')
    .eq('user_id', userId)
    .single();

  // 2. Top 5 viral patterns only (250 tokens max)
  const { data: topPatterns } = await supabase
    .from('viral_patterns')
    .select('pattern_type, pattern_description')
    .eq('user_id', userId)
    .order('success_rate', { ascending: false })
    .limit(5);

  // 3. Last 10 messages only (not full history)
  const { data: recentMessages } = await supabase
    .from('messages')
    .select('role, content')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(10);

  // Build compact system prompt
  const systemPrompt = `You create viral LinkedIn content using proven patterns.

Voice: ${voiceAnalysis?.overall_tone}
Style: ${voiceAnalysis?.writing_style}

Top Patterns:
${topPatterns?.map(p => `- ${p.pattern_description}`).join('\n')}

Always use these patterns. Be bold, specific, engaging.`;

  return {
    systemPrompt,
    conversationHistory: recentMessages?.reverse() || [],
    totalTokens: estimateTokenCount(systemPrompt) + estimateTokenCount(JSON.stringify(recentMessages)),
  };
}
```

---

## Step 9: Testing & Metrics

Create `lib/viral/metrics.ts`:

```typescript
export async function trackViralMetrics(userId: string) {
  const supabase = await createClient();

  const { data: performance } = await supabase
    .from('post_performance')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (!performance || performance.length === 0) return null;

  const avgEngagement =
    performance.reduce((sum, p) => sum + (p.actual_engagement || 0), 0) /
    performance.length;

  const viralPosts = performance.filter(
    p => p.actual_engagement && p.actual_engagement > avgEngagement * 2
  ).length;

  const consistency =
    1 - calculateStandardDeviation(performance.map(p => p.actual_engagement || 0));

  return {
    avgEngagement: avgEngagement.toFixed(2),
    viralPercentage: ((viralPosts / performance.length) * 100).toFixed(1),
    consistency: (consistency * 100).toFixed(1),
    totalPosts: performance.length,
  };
}

function calculateStandardDeviation(values: number[]): number {
  const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squareDiffs = values.map(val => Math.pow(val - avg, 2));
  const avgSquareDiff =
    squareDiffs.reduce((sum, val) => sum + val, 0) / squareDiffs.length;
  return Math.sqrt(avgSquareDiff) / avg; // Coefficient of variation
}
```

---

## Implementation Order

1. Add database tables (viral_patterns, post_performance)
2. Implement pattern extraction during onboarding
3. Build viral prompt system
4. Create smart context retrieval
5. Update chat to use viral-optimized context
6. Add feedback loop for learning
7. Monitor metrics and iterate

This creates a system that learns what makes YOUR posts go viral and consistently applies those patterns.