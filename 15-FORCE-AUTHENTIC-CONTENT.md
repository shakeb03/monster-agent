# 15-FORCE-AUTHENTIC-CONTENT.md - Stop Generic Content

## Problem
Agent claims to use your voice/patterns but generates generic LinkedIn garbage that sounds nothing like you.

---

## Step 1: Add Strict Validation to Content Generation

Update `lib/agent/orchestrator.ts` generateViralContent function:

```typescript
async function generateViralContent(
  userId: string,
  topic: string,
  tone: string | undefined,
  context: any
) {
  const { profile, voice, patterns, topPosts } = context;

  // ✅ CRITICAL: Validate we have REAL data
  if (!voice || !topPosts || topPosts.length === 0) {
    throw new Error('Cannot generate content without voice analysis and example posts');
  }

  if (!patterns || patterns.length === 0) {
    throw new Error('Cannot generate content without viral patterns');
  }

  // Extract REAL examples from user's top posts
  const realHooks = topPosts
    .map((p: any) => p.hook)
    .filter(Boolean)
    .slice(0, 3);

  const realPatterns = topPosts
    .map((p: any) => p.whatWorked)
    .filter(Boolean);

  // Get actual sentence structure from their posts
  const examplePost = topPosts[0]?.text || '';
  const sentenceCount = examplePost.split(/[.!?]+/).filter(Boolean).length;
  const avgSentenceLength = examplePost.length / sentenceCount;
  const usesEmojis = /[\u{1F300}-\u{1F9FF}]/u.test(examplePost);
  const usesHashtags = /#\w+/.test(examplePost);
  const lineBreaks = (examplePost.match(/\n/g) || []).length;

  const prompt = `Create a LinkedIn post that sounds EXACTLY like this user. Do NOT create generic LinkedIn content.

## USER'S ACTUAL VOICE (FROM THEIR TOP POSTS)

Real hooks they use:
${realHooks.map((h, i) => `${i + 1}. "${h}"`).join('\n')}

What actually worked for them:
${realPatterns.map((p, i) => `${i + 1}. ${p}`).join('\n')}

## THEIR WRITING DNA

Tone: ${voice.overall_tone}
Style: ${voice.writing_style}
Average sentence length: ${Math.round(avgSentenceLength)} characters
Uses emojis: ${usesEmojis ? 'YES' : 'NO'}
Uses hashtags: ${usesHashtags ? 'YES (sparingly)' : 'NO'}
Line breaks per post: ~${lineBreaks}

## EXAMPLE OF THEIR ACTUAL POST

"""
${examplePost}
"""

## PROVEN PATTERNS THEY USE

${patterns.slice(0, 5).map((p: any) => `- [${p.pattern_type}] ${p.pattern_description}`).join('\n')}

## YOUR TASK

Topic: ${topic}
${tone ? `Specific tone: ${tone}` : ''}

Create 3 variations that:
1. Use one of THEIR proven hooks (not generic hooks)
2. Match THEIR sentence structure and length
3. Use emojis/hashtags ONLY if they do
4. Sound like THEM, not like generic LinkedIn advice
5. Apply at least 2 of THEIR proven patterns

## CRITICAL RULES

❌ NO generic LinkedIn fluff like:
- "In the ever-evolving world of..."
- "As a [role] passionate about..."
- "Key Takeaways:" sections
- "Questions to Ponder:"
- Excessive emojis if they don't use them
- Bullet points if they don't use them

✅ YES authentic content:
- Starts like THEIR top posts
- Uses THEIR vocabulary and tone
- Matches THEIR formatting style
- Feels like THEM writing

## OUTPUT FORMAT

### Variation 1: [Describe hook type FROM THEIR POSTS]
[The actual post - must sound like them]

**Patterns used:** [from their proven patterns list]
**Why this works:** [based on their actual data, not generic advice]
**Engagement prediction:** X/10

[Repeat for variations 2 and 3]

### Recommendation
Which variation and why (based on their past performance data).

GO:`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are an expert at mimicking writing styles. Your job is to write content that sounds EXACTLY like the user based on their actual posts.

CRITICAL: You will be penalized for generic content. Every element must be grounded in the user's actual data.`,
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.9, // Higher for more authentic variation
    max_tokens: 2000,
  });

  return response.choices[0].message.content || '';
}
```

---

## Step 2: Add Pre-Flight Validation

Create `lib/agent/validators.ts`:

```typescript
interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateGenerationContext(context: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required: Voice analysis
  if (!context.voice) {
    errors.push('Missing voice analysis - cannot generate authentic content');
  } else {
    if (!context.voice.overall_tone) warnings.push('No tone data');
    if (!context.voice.writing_style) warnings.push('No writing style data');
    if (!context.voice.common_topics || context.voice.common_topics.length === 0) {
      warnings.push('No topic data');
    }
  }

  // Required: Top posts for examples
  if (!context.topPosts || context.topPosts.length === 0) {
    errors.push('No example posts - cannot understand writing style');
  } else if (context.topPosts.length < 3) {
    warnings.push('Only ' + context.topPosts.length + ' example posts - limited data');
  }

  // Required: Viral patterns
  if (!context.patterns || context.patterns.length === 0) {
    errors.push('No viral patterns - cannot ensure high engagement');
  } else if (context.patterns.length < 3) {
    warnings.push('Limited pattern data (' + context.patterns.length + ')');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
```

---

## Step 3: Update System Prompt to Demand Authenticity

```typescript
const systemPrompt = `You are an intelligent LinkedIn content agent. Your PRIMARY GOAL is to create content that sounds EXACTLY like the user.

## AUTHENTICITY REQUIREMENTS

Before generating ANY content, you MUST:
1. Call get_top_performing_posts to see real examples
2. Call get_viral_patterns to understand what works
3. Call get_user_profile to get voice analysis

When generating content:
1. Start by analyzing their top post hooks word-for-word
2. Match their sentence structure, not generic patterns
3. Use their vocabulary, not buzzwords
4. Apply ONLY patterns proven for them
5. If they don't use emojis, DON'T add emojis
6. If they write short posts, write short posts

## RED FLAGS (Never Generate)

❌ "In the ever-evolving world of..."
❌ "As a [role] passionate about..."
❌ "Key Takeaways:" sections with bullets
❌ Excessive emojis (unless user uses them)
❌ Generic "share your thoughts" CTAs
❌ Buzzword salad
❌ Posts that could be from anyone

## QUALITY CHECK

Before responding, ask yourself:
- Does this sound like the user's actual posts?
- Did I use their real hooks?
- Did I match their tone and style?
- Would someone recognize this as their writing?

If you answer "no" to any, start over.

## WHEN TO REFUSE

If you don't have:
- Voice analysis
- Example posts (minimum 3)
- Viral patterns

DO NOT generate generic content. Instead, explain what's missing and how to get it.`;
```

---

## Step 4: Add Quality Validation Post-Generation

Create `lib/agent/quality-check.ts`:

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function validateContentQuality(
  generatedContent: string,
  userExamples: string[],
  voiceAnalysis: any
): Promise<{ score: number; issues: string[]; passes: boolean }> {
  const prompt = `Compare this generated content to the user's actual posts and voice.

GENERATED CONTENT:
"""
${generatedContent}
"""

USER'S ACTUAL POSTS:
${userExamples.map((ex, i) => `Post ${i + 1}:\n${ex}`).join('\n\n')}

USER'S VOICE ANALYSIS:
Tone: ${voiceAnalysis.overall_tone}
Style: ${voiceAnalysis.writing_style}

EVALUATE:
1. Does it sound like the user? (1-10)
2. Does it use similar hooks/structure? (1-10)
3. Does it match their tone? (1-10)
4. Would you mistake this for their writing? (1-10)

Identify specific issues:
- Generic phrases not in their vocabulary
- Style mismatches
- Tone inconsistencies
- Structure differences

Return JSON:
{
  "similarity_score": average of 4 scores,
  "issues": [list of specific problems],
  "passes": true if score >= 7
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  return JSON.parse(response.choices[0].message.content || '{}');
}
```

---

## Step 5: Enforce Validation in Generation Flow

```typescript
// In generateViralContent, after getting response:

async function generateViralContent(
  userId: string,
  topic: string,
  tone: string | undefined,
  context: any
) {
  // Validate context first
  const validation = validateGenerationContext(context);
  
  if (!validation.valid) {
    return JSON.stringify({
      error: 'Cannot generate authentic content',
      reasons: validation.errors,
      needsData: true,
    });
  }

  // ... generate content ...

  const generatedContent = response.choices[0].message.content || '';

  // Quality check
  const qualityCheck = await validateContentQuality(
    generatedContent,
    context.topPosts.map((p: any) => p.text),
    context.voice
  );

  if (!qualityCheck.passes) {
    // Regenerate with stricter instructions
    console.warn('Generated content failed quality check:', qualityCheck.issues);
    
    return JSON.stringify({
      error: 'Generated content not authentic enough',
      issues: qualityCheck.issues,
      score: qualityCheck.score,
      suggestion: 'Review user data and regenerate with stricter adherence to their style',
    });
  }

  return generatedContent;
}
```

---

## Step 6: Add "Show Your Work" Mode

Update agent to include source attribution:

```typescript
// In the final response formatting:

const response = `${generatedContent}

---
**Data Used:**
- Voice Analysis: ${context.voice.overall_tone} tone, ${context.voice.writing_style} style
- Top Posts Analyzed: ${context.topPosts.length}
- Patterns Applied: ${context.patterns.slice(0, 3).map((p: any) => p.pattern_type).join(', ')}
- Example Hook: "${context.topPosts[0]?.hook}"

*This content was generated using YOUR actual data, not generic templates.*`;
```

---

## Step 7: Add Fallback Rejection

```typescript
// If agent generates generic content, catch it:

const GENERIC_PHRASES = [
  'in the ever-evolving world of',
  'as a [role] passionate about',
  'key takeaways:',
  'questions to ponder:',
  'let\'s dive in',
  'i\'ve been thinking about',
];

function containsGenericPhrases(content: string): string[] {
  const found: string[] = [];
  const lowerContent = content.toLowerCase();
  
  for (const phrase of GENERIC_PHRASES) {
    if (lowerContent.includes(phrase)) {
      found.push(phrase);
    }
  }
  
  return found;
}

// After generation:
const genericPhrases = containsGenericPhrases(generatedContent);

if (genericPhrases.length > 0) {
  throw new Error(
    `Generated content contains generic phrases: ${genericPhrases.join(', ')}. This does not match user's authentic style.`
  );
}
```

---

## Expected Output After Fix

**User:** "analyze my posts and write my next post"

**Agent:**
```
I analyzed your top 10 posts. Here's what's working:

📊 Your Top Patterns:
1. Short, punchy hooks (avg 8 words)
2. No emojis, no hashtags
3. Personal stories with lessons
4. 3-5 line breaks max
5. Questions that make people think

Your best post (15% engagement):
"I failed my first startup. Here's what I learned."

Now here are 3 posts in YOUR style:

---

### Variation 1: Failed Story Hook (Your Top Pattern)
I spent 6 months building the wrong product.

No market research. No customer interviews. Just my gut feeling and a lot of hope.

The MVP launched to crickets.

But that failure taught me more than any success could have. Now I talk to users before writing a single line of code.

What's a failure that changed how you work?

**Patterns used:** Failed story hook (12% avg engagement), conversational tone, question CTA
**Why this works:** Matches your top post format exactly - vulnerability + lesson + engagement question
**Prediction:** 9/10

---

### Variation 2: Contrarian Take (Your 2nd Best Pattern)
Everyone says "fail fast."

But nobody talks about the emotional toll of failing fast repeatedly.

Three failed projects in one year broke me. Not financially - emotionally.

Now I balance speed with sustainability. Move fast, but not so fast you burn out.

**Patterns used:** Contrarian hook, short sentences, personal truth
**Why this works:** Your contrarian posts get 18% more engagement
**Prediction:** 8/10

---

### Variation 3: Observation Hook
Noticed something weird at tech conferences.

Everyone networks during breaks. Nobody networks during talks.

The actual learning happens in hallway conversations.

Maybe we have conferences backwards?

**Patterns used:** Observation hook, progressive disclosure, provocation
**Why this works:** Your observation posts spark debate (avg 22 comments)
**Prediction:** 8/10

---

**Recommendation:** Use Variation 1. It matches your highest-performing format and feels most authentic to your voice.

**Data sources:**
- 10 posts analyzed (avg 8.2% engagement)
- Top 3 hooks: failed story, contrarian, observation
- Your style: short sentences, no fluff, thought-provoking endings
- Example: "I failed my first startup. Here's what I learned."
```

---

## Key Differences

**Before (Generic Garbage):**
- "🚀 Exploring the Frontiers of AI"
- "Key Takeaways:" sections
- Buzzwords and jargon
- Could be anyone's post

**After (Authentic):**
- Uses their actual hook formulas
- Matches their sentence structure
- Sounds like THEM
- Includes source attribution

---

## Implementation Priority

1. ✅ Add validation to generateViralContent (Step 1)
2. ✅ Update system prompt (Step 3)
3. ✅ Add quality check (Step 4)
4. Add generic phrase detection (Step 7)
5. Add "show your work" mode (Step 6)

This ensures ZERO generic content gets through.