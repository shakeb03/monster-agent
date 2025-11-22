# DIAGNOSIS: Why Your Agent Generates Generic Content

## Issue Analysis

Your agent claims to use your data but generates templates. Here's why:

---

## Root Cause #1: Tool Not Actually Called

Check your agent logs. I bet this is happening:

```
User: "write me a post"
↓
Agent: [Thinks about calling tools...]
↓
Agent: [Decides it already "knows" what to do]
↓
Agent: [Generates generic content WITHOUT calling any tools]
```

**Why?** The system prompt doesn't FORCE tool usage.

---

## Root Cause #2: Empty Context Passed

Even if tools are called, check what data they return:

```typescript
// Your tool probably returns something like:
{
  voice: { overall_tone: "professional" },  // ← Too generic
  topPosts: [],  // ← EMPTY!
  patterns: []   // ← EMPTY!
}

// Agent thinks: "I have voice data, good enough!"
// Agent generates: Generic template with "professional tone"
```

---

## Root Cause #3: Weak System Prompt

Current prompt probably says:
> "Use the user's voice and style when generating content"

This is **too vague**. Agent interprets as:
> "Make it sound professional-ish"

---

## IMMEDIATE FIX: Nuclear Option

Replace your entire content generation with this STRICT version:

```typescript
// lib/agent/strict-generator.ts

import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function generateStrictAuthenticContent(userId: string, topic?: string) {
  const supabase = await createClient();

  // Step 1: Get TOP 5 posts (not just metadata)
  const { data: topPosts } = await supabase
    .from('linkedin_posts')
    .select('post_text, engagement_rate, post_analysis(hook_analysis, what_worked)')
    .eq('user_id', userId)
    .order('engagement_rate', { ascending: false })
    .limit(5);

  if (!topPosts || topPosts.length === 0) {
    throw new Error('NO POSTS FOUND. User must complete onboarding first.');
  }

  // Step 2: Get voice analysis
  const { data: voice } = await supabase
    .from('voice_analysis')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!voice) {
    throw new Error('NO VOICE ANALYSIS. User must complete onboarding first.');
  }

  // Step 3: EXTRACT EXACT PATTERNS from posts
  const realHooks = topPosts.map(p => p.post_text.split('\n')[0]);
  const avgLength = topPosts.reduce((sum, p) => sum + p.post_text.length, 0) / topPosts.length;
  const usesEmojis = topPosts.some(p => /[\u{1F300}-\u{1F9FF}]/u.test(p.post_text));
  const usesHashtags = topPosts.some(p => /#\w+/.test(p.post_text));
  const usesBullets = topPosts.some(p => /^[•\-\*]\s/m.test(p.post_text));

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

${topic ? `Topic: ${topic}` : `Topic: Choose from their common topics: ${voice.common_topics.slice(0, 3).join(', ')}`}

Write 1 post that could be mistaken for THEIR writing.

Start with a hook SIMILAR TO one of their actual hooks.
Match their structure EXACTLY.
Use their vocabulary and tone.

GO:`;

  // Step 5: Generate with high temperature for authenticity
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

  // Step 6: VALIDATE before returning
  const validation = await validatePost(generatedPost, topPosts, voice);

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
  topPosts: any[],
  voice: any
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
  const hasEmojis = /[\u{1F300}-\u{1F9FF}]/u.test(generated);
  const userUsesEmojis = topPosts.some(p => /[\u{1F300}-\u{1F9FF}]/u.test(p.post_text));
  
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
```

---

## Usage

Replace your agent's generate_viral_content tool with this:

```typescript
// In orchestrator.ts:

case 'generate_viral_content':
  toolResult = await generateStrictAuthenticContent(
    toolArgs.user_id,
    toolArgs.topic
  );
  break;
```

---

## Why This Works

**Before:**
- Vague prompt: "Use their style"
- Generic data: "tone: professional"
- No validation

**After:**
- Shows 3 FULL posts word-for-word
- Extracts EXACT hooks they use
- Measures specific patterns (emojis, bullets, length)
- Lists FORBIDDEN phrases
- Validates output before returning
- Fails with error if not authentic enough

---

## Testing

Run this and check:

```typescript
const result = await generateStrictAuthenticContent(userId, 'leadership');

console.log('Generated:', result.post);
console.log('Validation score:', result.validation.score);
console.log('Issues:', result.validation.issues);
console.log('Used patterns:', result.sourceData.patterns);
```

**Expected output:**
```
Generated: [Post that actually sounds like you]
Validation score: 8/10
Issues: []
Used patterns: { usesEmojis: false, usesHashtags: false, usesBullets: false }
```

---

## If This STILL Fails

Check these:

1. **Are top posts actually in DB?**
```sql
SELECT count(*) FROM linkedin_posts WHERE user_id = 'your-id';
-- Should return > 0
```

2. **Do posts have content?**
```sql
SELECT post_text FROM linkedin_posts WHERE user_id = 'your-id' LIMIT 1;
-- Should return actual post text, not null
```

3. **Is voice analysis populated?**
```sql
SELECT * FROM voice_analysis WHERE user_id = 'your-id';
-- Should have overall_tone, writing_style, etc.
```

4. **Agent calling right function?**
Add logging:
```typescript
console.log('CALLING generateStrictAuthenticContent with:', { userId, topic });
const result = await generateStrictAuthenticContent(userId, topic);
console.log('RESULT:', result);
```

If any of these fail, your onboarding didn't complete properly.

---

## Nuclear Option: Force It

If agent still ignores tools, bypass it entirely:

```typescript
// app/api/generate-post/route.ts

export async function POST(req: NextRequest) {
  const { userId, topic } = await req.json();
  
  // Skip agent, go directly to strict generator
  const result = await generateStrictAuthenticContent(userId, topic);
  
  return NextResponse.json(result);
}
```

Then in frontend:
```typescript
// Call this instead of chat API
const response = await fetch('/api/generate-post', {
  method: 'POST',
  body: JSON.stringify({ userId, topic: 'leadership' }),
});
```

---

## Summary

Your agent is either:
1. Not calling tools at all
2. Tools returning empty data
3. Ignoring tool results and using generic templates

The strict generator fixes all three by:
- Fetching data directly (no agent intermediary)
- Validating data exists before generating
- Using ultra-specific prompts with ACTUAL user content
- Rejecting output if not authentic enough

This is the nuclear option that FORCES authenticity.