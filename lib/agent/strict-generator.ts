import OpenAI from 'openai';
import { createAdminClient } from '@/lib/supabase/admin';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function generateStrictAuthenticContent(userId: string, topic?: string) {
  const supabase = createAdminClient();

  console.log('[strict-generator] Starting with userId:', userId, 'topic:', topic);

  // Step 1: Get TOP 5 posts (not just metadata)
  const { data: topPosts } = await supabase
    .from('linkedin_posts')
    .select('post_text, engagement_rate')
    .eq('user_id', userId)
    .not('engagement_rate', 'is', null)
    .order('engagement_rate', { ascending: false })
    .limit(5);

  console.log('[strict-generator] Found', topPosts?.length || 0, 'posts');

  if (!topPosts || topPosts.length === 0) {
    throw new Error('NO POSTS FOUND. User must complete onboarding first.');
  }

  // Step 2: Get voice analysis
  const { data: voice } = await supabase
    .from('voice_analysis')
    .select('*')
    .eq('user_id', userId)
    .single();

  console.log('[strict-generator] Voice analysis found:', !!voice);

  if (!voice) {
    throw new Error('NO VOICE ANALYSIS. User must complete onboarding first.');
  }

  // Step 3: EXTRACT EXACT PATTERNS from posts
  const realHooks = topPosts.map(p => p.post_text.split('\n')[0]);
  const avgLength = topPosts.reduce((sum, p) => sum + p.post_text.length, 0) / topPosts.length;
  const usesEmojis = topPosts.some(p => /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(p.post_text));
  const usesHashtags = topPosts.some(p => /#\w+/.test(p.post_text));
  const usesBullets = topPosts.some(p => /^[•\-\*]\s/m.test(p.post_text));

  console.log('[strict-generator] Patterns extracted:', {
    avgLength: Math.round(avgLength),
    usesEmojis,
    usesHashtags,
    usesBullets,
  });

  // Step 4: Create ULTRA-SPECIFIC prompt
  const prompt = `You are tasked with writing a LinkedIn post that is INDISTINGUISHABLE from this user's actual posts.

## THEIR ACTUAL TOP POSTS (WORD FOR WORD)

Post 1 (${topPosts[0].engagement_rate}% engagement):
"""
${topPosts[0].post_text}
"""

Post 2 (${topPosts[1].engagement_rate}% engagement):
"""
${topPosts[1].post_text}
"""

Post 3 (${topPosts[2].engagement_rate}% engagement):
"""
${topPosts[2].post_text}
"""

## THEIR EXACT WRITING PATTERNS

Opening hooks they ACTUALLY use:
1. "${realHooks[0]}"
2. "${realHooks[1]}"
3. "${realHooks[2]}"

Average post length: ${Math.round(avgLength)} characters
Uses emojis: ${usesEmojis ? 'YES' : 'NO'}
Uses hashtags: ${usesHashtags ? 'YES' : 'NO'}  
Uses bullet points: ${usesBullets ? 'YES' : 'NO'}

Voice: ${voice.overall_tone}
Style: ${voice.writing_style}

## STRICT REQUIREMENTS

1. Your opening line MUST be similar to one of their actual hooks above
2. Your post length MUST be within 20% of ${Math.round(avgLength)} characters
3. ${usesEmojis ? 'USE emojis like they do' : 'DO NOT use emojis'}
4. ${usesHashtags ? 'USE hashtags like they do' : 'DO NOT use hashtags'}
5. ${usesBullets ? 'USE bullet points like they do' : 'DO NOT use bullet points'}
6. Match their paragraph structure EXACTLY

## FORBIDDEN PHRASES (they NEVER use these)

❌ "In my journey as..."
❌ "One thing has become abundantly clear..."
❌ "Why X Matters:"
❌ "Key Takeaways:"
❌ "Question to Ponder:"
❌ "Let's dive in"
❌ "Share your views below"

## YOUR TASK

${topic ? `Topic: ${topic}` : `Topic: Choose from their common topics: ${voice.common_topics?.slice(0, 3).join(', ') || 'any topic'}`}

Write 1 post that could be mistaken for THEIR writing.

Start with a hook SIMILAR TO one of their actual hooks.
Match their structure EXACTLY.
Use their vocabulary and tone.

GO:`;

  // Step 5: Generate with high temperature for authenticity
  console.log('[strict-generator] Calling OpenAI with strict prompt...');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are a writing mimic. Your job is to write in someone else\'s exact style. Creativity means matching their style perfectly, not adding your own flair.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 1000,
  });

  const generatedPost = response.choices[0].message.content || '';

  console.log('[strict-generator] Generated post length:', generatedPost.length);

  // Step 6: VALIDATE before returning
  const validation = await validatePost(generatedPost, topPosts);

  console.log('[strict-generator] Validation score:', validation.score);

  if (validation.score < 7) {
    throw new Error(
      `Generated post failed authenticity check (score: ${validation.score}/10). Issues: ${validation.issues.join(', ')}`
    );
  }

  return {
    post: generatedPost,
    validation,
    sourceData: {
      exampleHooks: realHooks,
      avgLength: Math.round(avgLength),
      patterns: { usesEmojis, usesHashtags, usesBullets },
    },
  };
}

async function validatePost(
  generated: string,
  topPosts: Array<{ post_text: string }>
): Promise<{ score: number; issues: string[] }> {
  const issues: string[] = [];
  let score = 10;

  // Check length similarity
  const avgLength = topPosts.reduce((sum, p) => sum + p.post_text.length, 0) / topPosts.length;
  const lengthDiff = Math.abs(generated.length - avgLength) / avgLength;
  if (lengthDiff > 0.3) {
    issues.push(`Length mismatch: ${generated.length} vs ${Math.round(avgLength)} expected`);
    score -= 2;
  }

  // Check for forbidden phrases
  const forbiddenPhrases = [
    'in my journey',
    'one thing has become',
    'key takeaways',
    'question to ponder',
    'let\'s dive in',
  ];

  for (const phrase of forbiddenPhrases) {
    if (generated.toLowerCase().includes(phrase)) {
      issues.push(`Contains forbidden phrase: "${phrase}"`);
      score -= 2;
    }
  }

  // Check emoji usage
  const hasEmojis = /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(generated);
  const userUsesEmojis = topPosts.some(p => /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(p.post_text));
  
  if (hasEmojis !== userUsesEmojis) {
    issues.push(userUsesEmojis ? 'Should use emojis' : 'Should not use emojis');
    score -= 1;
  }

  // Check bullet points
  const hasBullets = /^[•\-\*]\s/m.test(generated);
  const userUsesBullets = topPosts.some(p => /^[•\-\*]\s/m.test(p.post_text));
  
  if (hasBullets !== userUsesBullets) {
    issues.push(userUsesBullets ? 'Should use bullet points' : 'Should not use bullet points');
    score -= 1;
  }

  return { score: Math.max(0, score), issues };
}
