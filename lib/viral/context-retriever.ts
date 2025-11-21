import OpenAI from 'openai';
import { createAdminClient } from '@/lib/supabase/admin';

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
  const supabase = createAdminClient();

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
      why_worked: (p as any).post_analysis?.what_worked,
    })) || [],
    totalTokens: estimateTokens(patterns || [], examplePosts || []),
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

