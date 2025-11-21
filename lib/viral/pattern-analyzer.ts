import OpenAI from 'openai';
import { createAdminClient } from '@/lib/supabase/admin';

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
  const supabase = createAdminClient();

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
  const supabase = createAdminClient();

  const { data } = await supabase
    .from('viral_patterns')
    .select('*')
    .eq('user_id', userId)
    .order('success_rate', { ascending: false })
    .limit(limit);

  return data || [];
}

