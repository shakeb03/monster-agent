import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// For debugging - compare generated vs actual

export async function compareToActualPosts(
  generatedPost: string,
  actualPosts: string[]
): Promise<{
  similarities: string[];
  differences: string[];
  overallMatch: number;
}> {
  const prompt = `Compare this generated post to actual posts:

GENERATED:
${generatedPost}

ACTUAL POSTS:
${actualPosts.join('\n---\n')}

Identify:
1. What's similar (tone, structure, phrases)
2. What's different (vocabulary, style, approach)
3. Overall match score (1-10)

Return JSON:
{
  "similarities": ["similarity 1", "similarity 2"],
  "differences": ["difference 1", "difference 2"],
  "overallMatch": 7.5
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const result = JSON.parse(response.choices[0].message.content || '{}');

  return {
    similarities: result.similarities || [],
    differences: result.differences || [],
    overallMatch: result.overallMatch || 0,
  };
}

export function passesQualityChecks(post: string, voiceDNA: any): {
  passed: boolean;
  checks: Record<string, boolean>;
} {
  const checks = {
    noGenericOpening: !/(ever start a|have you ever|in (the|today's) world)/i.test(post),
    usesTheirPhrases: voiceDNA.commonPhrases.some((p: string) => 
      post.toLowerCase().includes(p.toLowerCase())
    ),
    noForbiddenPhrases: !voiceDNA.neverUses.some((n: string) =>
      post.toLowerCase().includes(n.toLowerCase())
    ),
    noEmDashes: !post.includes('—'),
    noSemicolons: !post.includes(';'),
    matchesContractionsStyle: voiceDNA.usesContractions 
      ? /\b(I'm|you're|it's|that's|don't|can't)\b/.test(post)
      : !/\b(I'm|you're|it's|that's|don't|can't)\b/.test(post),
  };

  const passed = Object.values(checks).every(Boolean);
  
  if (!passed) {
    console.error('[quality-check] Failed checks:', checks);
  }

  return { passed, checks };
}

