# 18-VOICE-CLONING-SYSTEM.md - Force Authentic Voice

## Problem
Agent generates generic LinkedIn slop that sounds nothing like you, even after conversation.

**Root cause:** Agent doesn't deeply study your actual writing before generating.

---

## Step 1: Create Voice DNA Extractor

Create `lib/voice/dna-extractor.ts`:

```typescript
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

interface VoiceDNA {
  // Opening patterns
  hookPatterns: string[];
  firstSentenceExamples: string[];
  
  // Vocabulary
  commonPhrases: string[];
  uniqueWords: string[];
  avoidedWords: string[];
  
  // Structure
  avgSentenceLength: number;
  avgParagraphLength: number;
  usesShortSentences: boolean;
  usesFragments: boolean;
  
  // Style markers
  usesContractions: boolean;
  usesQuestions: boolean;
  usesEmojis: boolean;
  usesHashtags: boolean;
  hashtagStyle: string;
  
  // Tone
  selfDeprecating: boolean;
  conversational: boolean;
  technical: boolean;
  vulnerable: boolean;
  
  // Story structure
  storyProgression: string[];
  endingStyle: string;
  
  // Forbidden patterns
  neverUses: string[];
}

export async function extractVoiceDNA(userId: string): Promise<VoiceDNA> {
  const supabase = await createClient();

  // Get user's top 10 posts (full text)
  const { data: posts } = await supabase
    .from('linkedin_posts')
    .select('post_text, engagement_rate')
    .eq('user_id', userId)
    .order('engagement_rate', { ascending: false })
    .limit(10);

  if (!posts || posts.length === 0) {
    throw new Error('No posts to extract voice from');
  }

  // Deep analysis with GPT
  const analysisPrompt = `You are a writing analyst. Deeply analyze these LinkedIn posts to extract the author's unique writing DNA.

POSTS (FULL TEXT):
${posts.map((p, i) => `
=== POST ${i + 1} (${p.engagement_rate}% engagement) ===
${p.post_text}
`).join('\n')}

Extract SPECIFIC patterns:

1. HOOK PATTERNS (exact opening formulas they use)
   - Don't say "uses questions" - quote actual openings: "I got annoyed enough", "X taught me more than Y"
   
2. UNIQUE PHRASES (phrases they repeat that others don't)
   - Look for: "like an idiot", "I finally snapped", "honestly?", "here's what's wild"
   
3. VOCABULARY PROFILE
   - Words they USE frequently
   - Words they AVOID (corporate speak, jargon)
   
4. SENTENCE STRUCTURE
   - Average length (count words)
   - Do they use fragments? ("Exactly." "Still learning.")
   - Do they use long compound sentences or short punchy ones?
   
5. TONE MARKERS
   - Self-deprecating? Quote examples
   - Conversational? Quote examples
   - Technical details? Quote examples
   - Vulnerable? Quote examples
   
6. STORY STRUCTURE
   - How do they progress? (problem → attempt → failure → lesson)
   - How do they end? (question, statement, call to action)
   
7. WHAT THEY NEVER DO
   - Phrases that appear in NO posts
   - Structures they never use
   - Corporate speak they avoid

Return detailed JSON with SPECIFIC examples, not generic descriptions.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are a writing analyst. Extract SPECIFIC patterns with examples, not generic descriptions.',
      },
      { role: 'user', content: analysisPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const extracted = JSON.parse(response.choices[0].message.content || '{}');

  // Process and structure
  const allText = posts.map(p => p.post_text).join(' ');
  
  // Calculate metrics
  const sentences = allText.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = allText.split(/\s+/);
  const avgSentenceLength = words.length / sentences.length;
  
  const paragraphs = posts.map(p => p.post_text.split('\n\n').filter(para => para.trim()));
  const avgParagraphLength = paragraphs.flat().length / posts.length;

  return {
    hookPatterns: extracted.hookPatterns || [],
    firstSentenceExamples: posts.map(p => p.post_text.split('\n')[0]).slice(0, 5),
    
    commonPhrases: extracted.commonPhrases || [],
    uniqueWords: extracted.uniqueWords || [],
    avoidedWords: extracted.avoidedWords || [],
    
    avgSentenceLength: Math.round(avgSentenceLength),
    avgParagraphLength: Math.round(avgParagraphLength),
    usesShortSentences: avgSentenceLength < 15,
    usesFragments: /^\w+\.$|^\w+ \w+\.$/.test(allText),
    
    usesContractions: /\b(I'm|you're|it's|that's|don't|can't)\b/.test(allText),
    usesQuestions: /\?/.test(allText),
    usesEmojis: /[\u{1F300}-\u{1F9FF}]/u.test(allText),
    usesHashtags: /#\w+/.test(allText),
    hashtagStyle: extracted.hashtagStyle || 'specific tools/concepts',
    
    selfDeprecating: extracted.selfDeprecating || false,
    conversational: extracted.conversational || false,
    technical: extracted.technical || false,
    vulnerable: extracted.vulnerable || false,
    
    storyProgression: extracted.storyProgression || [],
    endingStyle: extracted.endingStyle || '',
    
    neverUses: extracted.neverUses || [],
  };
}
```

---

## Step 2: Create Voice-Enforced Generator

Create `lib/voice/enforced-generator.ts`:

```typescript
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';
import { extractVoiceDNA } from './dna-extractor';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function generateWithEnforcedVoice(
  userId: string,
  topic: string,
  angle: string
): Promise<{ post: string; voiceScore: number; issues: string[] }> {
  
  const supabase = await createClient();

  // Step 1: Extract voice DNA
  console.log('Extracting voice DNA...');
  const voiceDNA = await extractVoiceDNA(userId);

  // Step 2: Get user's actual posts for examples
  const { data: posts } = await supabase
    .from('linkedin_posts')
    .select('post_text, engagement_rate')
    .eq('user_id', userId)
    .order('engagement_rate', { ascending: false })
    .limit(3);

  if (!posts || posts.length === 0) {
    throw new Error('No posts available');
  }

  // Step 3: Build ULTRA-SPECIFIC prompt
  const prompt = buildVoiceClonePrompt(voiceDNA, posts, topic, angle);

  // Step 4: Generate with high temperature
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a writing mimic. Your ONLY job is to write in someone else's EXACT voice.

CRITICAL RULES:
1. Study the voice DNA carefully
2. Use their EXACT opening patterns
3. Match their sentence length and structure
4. Use their vocabulary, NOT yours
5. Follow their story progression
6. NEVER use phrases they never use

If you generate generic LinkedIn content, you fail.
If someone can't tell it's their writing, you fail.
Success = indistinguishable from their actual posts.`,
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.9,
    max_tokens: 600,
  });

  let generatedPost = response.choices[0].message.content || '';

  // Step 5: Clean AI artifacts
  generatedPost = cleanAIArtifacts(generatedPost, voiceDNA);

  // Step 6: Validate voice match
  const validation = await validateVoiceMatch(generatedPost, voiceDNA, posts);

  // Step 7: Regenerate if score too low
  if (validation.score < 7) {
    console.log(`Voice score too low (${validation.score}/10). Regenerating...`);
    
    // Try again with even stricter prompt
    const stricterPrompt = buildStricterPrompt(voiceDNA, posts, topic, angle, validation.issues);
    const retryResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a writing mimic. Match the voice EXACTLY or fail.',
        },
        { role: 'user', content: stricterPrompt },
      ],
      temperature: 0.9,
    });

    generatedPost = retryResponse.choices[0].message.content || '';
    generatedPost = cleanAIArtifacts(generatedPost, voiceDNA);
  }

  // Final validation
  const finalValidation = await validateVoiceMatch(generatedPost, voiceDNA, posts);

  return {
    post: generatedPost,
    voiceScore: finalValidation.score,
    issues: finalValidation.issues,
  };
}

function buildVoiceClonePrompt(
  voiceDNA: any,
  posts: any[],
  topic: string,
  angle: string
): string {
  return `Write ONE LinkedIn post about "${topic}" (angle: ${angle}) in this person's EXACT voice.

## THEIR ACTUAL POSTS (STUDY THESE WORD-FOR-WORD)

${posts.map((p, i) => `POST ${i + 1} (${p.engagement_rate}% engagement):
${p.post_text}
---`).join('\n\n')}

## THEIR VOICE DNA (MATCH THIS EXACTLY)

### Opening Hooks They ACTUALLY Use:
${voiceDNA.hookPatterns.map((h: string, i: number) => `${i + 1}. "${h}"`).join('\n')}

First sentences from their posts:
${voiceDNA.firstSentenceExamples.map((s: string, i: number) => `${i + 1}. "${s}"`).join('\n')}

### Phrases They ACTUALLY Say:
${voiceDNA.commonPhrases.map((p: string) => `- "${p}"`).join('\n')}

### Their Writing Style:
- Average sentence: ${voiceDNA.avgSentenceLength} words
- Short sentences: ${voiceDNA.usesShortSentences ? 'YES' : 'NO'}
- Fragments: ${voiceDNA.usesFragments ? 'YES (e.g., "Exactly." "Still learning.")' : 'NO'}
- Contractions: ${voiceDNA.usesContractions ? 'YES (I\'m, that\'s, don\'t)' : 'NO'}
- Questions: ${voiceDNA.usesQuestions ? 'YES' : 'NO'}
- Emojis: ${voiceDNA.usesEmojis ? 'YES' : 'NO'}
- Hashtags: ${voiceDNA.usesHashtags ? `YES (${voiceDNA.hashtagStyle})` : 'NO'}

### Their Tone:
- Self-deprecating: ${voiceDNA.selfDeprecating ? 'YES - they call out their own mistakes' : 'NO'}
- Conversational: ${voiceDNA.conversational ? 'YES - casual, like talking to friend' : 'NO'}
- Technical: ${voiceDNA.technical ? 'YES - includes specific details' : 'NO'}
- Vulnerable: ${voiceDNA.vulnerable ? 'YES - honest about failures' : 'NO'}

### Story Structure They Use:
${voiceDNA.storyProgression.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}

### How They End Posts:
${voiceDNA.endingStyle}

## WHAT THEY NEVER USE (FORBIDDEN):

${voiceDNA.neverUses.map((n: string) => `❌ ${n}`).join('\n')}

## YOUR TASK:

Write ONE post about "${topic}" (${angle}) that:

1. ✅ Opens with one of THEIR hook patterns (use similar structure, not exact copy)
2. ✅ Uses THEIR phrases and vocabulary
3. ✅ Matches THEIR sentence length (avg ${voiceDNA.avgSentenceLength} words)
4. ✅ Follows THEIR story structure
5. ✅ Includes THEIR tone markers (self-deprecating, conversational, etc.)
6. ✅ Ends like THEY end posts
7. ✅ ${voiceDNA.usesHashtags ? `Uses hashtags like them: ${voiceDNA.hashtagStyle}` : 'No hashtags'}

8. ❌ NEVER uses forbidden phrases
9. ❌ NEVER sounds corporate or generic
10. ❌ NEVER uses words they avoid

## CRITICAL:

This should be SO similar to their writing that if you mixed it with their real posts, no one could tell which is which.

Write ONLY the post. No meta-commentary. No "here's your post." Just the post itself.`;
}

function buildStricterPrompt(
  voiceDNA: any,
  posts: any[],
  topic: string,
  angle: string,
  issues: string[]
): string {
  return `You FAILED to match the voice. Issues found:
${issues.map(i => `- ${i}`).join('\n')}

Here are their ACTUAL posts again. READ THEM CAREFULLY:

${posts.map((p, i) => `${p.post_text}\n---`).join('\n\n')}

Now write about "${topic}" (${angle}) but this time:

1. Copy their EXACT opening style (e.g., if they start with "I got annoyed", start similarly)
2. Use their EXACT phrases (${voiceDNA.commonPhrases.slice(0, 3).join(', ')})
3. Match their sentence length EXACTLY (~${voiceDNA.avgSentenceLength} words per sentence)
4. Use NO generic LinkedIn phrases
5. Sound like THEM, not like a LinkedIn influencer

Be radical about matching their voice. When in doubt, copy their structure more closely.

Write the post:`;
}

function cleanAIArtifacts(post: string, voiceDNA: any): string {
  let cleaned = post.trim();

  // Remove markdown formatting
  cleaned = cleaned.replace(/\*\*/g, '');
  cleaned = cleaned.replace(/\*/g, '');

  // Fix punctuation based on their style
  if (!voiceDNA.usesEmojis) {
    cleaned = cleaned.replace(/[\u{1F300}-\u{1F9FF}]/gu, '');
  }

  // Remove em dashes (replace with regular dash)
  cleaned = cleaned.replace(/—/g, '-');
  
  // Remove semicolons (they're an AI tell)
  cleaned = cleaned.replace(/;/g, '.');

  // Remove "Here's your post" or similar meta text
  cleaned = cleaned.replace(/^(Here's|Here is) (your|the) post:?\s*/i, '');
  cleaned = cleaned.replace(/^Post:?\s*/i, '');

  return cleaned.trim();
}

async function validateVoiceMatch(
  generated: string,
  voiceDNA: any,
  actualPosts: any[]
): Promise<{ score: number; issues: string[] }> {
  const issues: string[] = [];
  let score = 10;

  // Check sentence length
  const sentences = generated.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const avgLength = generated.split(/\s+/).length / sentences.length;
  const lengthDiff = Math.abs(avgLength - voiceDNA.avgSentenceLength);

  if (lengthDiff > 5) {
    issues.push(`Sentence length mismatch: ${Math.round(avgLength)} vs ${voiceDNA.avgSentenceLength} expected`);
    score -= 2;
  }

  // Check for forbidden phrases
  for (const forbidden of voiceDNA.neverUses) {
    if (generated.toLowerCase().includes(forbidden.toLowerCase())) {
      issues.push(`Contains forbidden phrase: "${forbidden}"`);
      score -= 3;
    }
  }

  // Check if uses their phrases
  const usesTheirPhrases = voiceDNA.commonPhrases.some((phrase: string) =>
    generated.toLowerCase().includes(phrase.toLowerCase())
  );

  if (!usesTheirPhrases && voiceDNA.commonPhrases.length > 0) {
    issues.push('Does not use any of their signature phrases');
    score -= 1;
  }

  // Check contractions match
  const hasContractions = /\b(I'm|you're|it's|that's|don't|can't)\b/.test(generated);
  if (hasContractions !== voiceDNA.usesContractions) {
    issues.push(voiceDNA.usesContractions ? 'Should use contractions' : 'Should not use contractions');
    score -= 1;
  }

  // Check for generic LinkedIn phrases
  const genericPhrases = [
    'ever start a project',
    'game-changer',
    'key takeaway',
    'in today\'s world',
    'the power of',
    'dive deep',
    'circle back',
    'at the end of the day',
  ];

  for (const generic of genericPhrases) {
    if (generated.toLowerCase().includes(generic)) {
      issues.push(`Contains generic LinkedIn phrase: "${generic}"`);
      score -= 2;
    }
  }

  // Use GPT for deep similarity check
  const similarityPrompt = `Compare this generated post to the user's actual posts:

GENERATED:
${generated}

ACTUAL POSTS:
${actualPosts.map(p => p.post_text).join('\n---\n')}

Rate similarity 1-10:
- 10 = indistinguishable from their writing
- 7-9 = very similar
- 4-6 = somewhat similar
- 1-3 = doesn't match at all

Return JSON: { "similarity": number, "reasoning": "why" }`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: similarityPrompt }],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const result = JSON.parse(response.choices[0].message.content || '{"similarity": 5}');
  
  if (result.similarity < 7) {
    issues.push(`GPT similarity score too low: ${result.similarity}/10. ${result.reasoning}`);
  }

  // Final score is average of rule-based and GPT score
  const finalScore = Math.round((score + result.similarity) / 2);

  return {
    score: Math.max(0, finalScore),
    issues,
  };
}
```

---

## Step 3: Update Agent to Use Voice-Enforced Generator

Update `lib/agent/orchestrator.ts`:

```typescript
import { generateWithEnforcedVoice } from '@/lib/voice/enforced-generator';

// Update the generate_human_post tool implementation:

async function generateHumanPostTool(
  userId: string,
  refinedIntent: any
): Promise<ToolResult> {
  try {
    console.log('Generating with enforced voice...');
    
    const result = await generateWithEnforcedVoice(
      userId,
      refinedIntent.topic,
      refinedIntent.angle || 'personal story'
    );

    if (result.voiceScore < 7) {
      return errorResult('Generated content failed voice validation', {
        reason: `Voice score: ${result.voiceScore}/10`,
        issues: result.issues,
        suggestions: [
          'Voice DNA might need recalibration',
          'Try a different topic or angle',
        ],
      });
    }

    return successResult({
      post: result.post,
      voiceScore: result.voiceScore,
      note: result.issues.length > 0
        ? `Minor issues: ${result.issues.join(', ')}`
        : 'Perfect voice match!',
    });
  } catch (error) {
    return errorResult('Failed to generate content', {
      reason: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
```

---

## Step 4: Add Voice DNA Caching

Create `lib/voice/cache.ts`:

```typescript
import { createClient } from '@/lib/supabase/server';

// Add table for caching
/*
CREATE TABLE voice_dna_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    voice_dna JSONB NOT NULL,
    posts_analyzed INTEGER NOT NULL,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_voice_dna_user_id ON voice_dna_cache(user_id);
*/

export async function getCachedVoiceDNA(userId: string): Promise<any | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('voice_dna_cache')
    .select('voice_dna, last_updated')
    .eq('user_id', userId)
    .single();

  if (!data) return null;

  // Check if cache is stale (older than 24 hours)
  const lastUpdated = new Date(data.last_updated);
  const now = new Date();
  const hoursSinceUpdate = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60);

  if (hoursSinceUpdate > 24) {
    return null; // Stale cache
  }

  return data.voice_dna;
}

export async function saveVoiceDNA(userId: string, voiceDNA: any, postsAnalyzed: number): Promise<void> {
  const supabase = await createClient();

  await supabase
    .from('voice_dna_cache')
    .upsert({
      user_id: userId,
      voice_dna: voiceDNA,
      posts_analyzed: postsAnalyzed,
      last_updated: new Date().toISOString(),
    });
}

// Update extractor to use cache
import { getCachedVoiceDNA, saveVoiceDNA } from './cache';

export async function extractVoiceDNA(userId: string): Promise<VoiceDNA> {
  // Try cache first
  const cached = await getCachedVoiceDNA(userId);
  if (cached) {
    console.log('Using cached voice DNA');
    return cached;
  }

  // Extract fresh
  console.log('Extracting fresh voice DNA...');
  const voiceDNA = await extractVoiceDNAFresh(userId);

  // Save to cache
  await saveVoiceDNA(userId, voiceDNA, 10);

  return voiceDNA;
}
```

---

## Step 5: Add Voice Comparison Tool

Create `lib/voice/compare.ts`:

```typescript
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

Return JSON.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });

  return JSON.parse(response.choices[0].message.content || '{}');
}
```

---

## Step 6: Test & Debug Endpoint

Create `app/api/test-voice/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { extractVoiceDNA } from '@/lib/voice/dna-extractor';
import { generateWithEnforcedVoice } from '@/lib/voice/enforced-generator';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_user_id', userId)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Extract voice DNA
    console.log('Extracting voice DNA...');
    const voiceDNA = await extractVoiceDNA(user.id);

    // Generate test post
    console.log('Generating test post...');
    const result = await generateWithEnforcedVoice(
      user.id,
      'system design',
      'lesson from constraint'
    );

    // Get actual posts for comparison
    const { data: actualPosts } = await supabase
      .from('linkedin_posts')
      .select('post_text')
      .eq('user_id', user.id)
      .limit(3);

    return NextResponse.json({
      voiceDNA: {
        hookPatterns: voiceDNA.hookPatterns,
        commonPhrases: voiceDNA.commonPhrases,
        avgSentenceLength: voiceDNA.avgSentenceLength,
        neverUses: voiceDNA.neverUses,
      },
      generatedPost: result.post,
      voiceScore: result.voiceScore,
      issues: result.issues,
      actualPostSample: actualPosts?.[0]?.post_text || '',
    });
  } catch (error) {
    console.error('Test voice error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
```

---

## Step 7: Quality Checklist

Before returning content, verify:

```typescript
function passesQualityChecks(post: string, voiceDNA: any): boolean {
  const checks = {
    noGenericOpening: !/(ever start a|have you ever|in (the|today's) world)/i.test(post),
    matchesSentenceLength: true, // checked in validation
    usesTheirPhrases: voiceDNA.commonPhrases.some((p: string) => 
      post.toLowerCase().includes(p.toLowerCase())
    ),
    noForbiddenPhrases: !voiceDNA.neverUses.some((n: string) =>
      post.toLowerCase().includes(n.toLowerCase())
    ),
    noEmDashes: !post.includes('—'),
    noSemicolons: !post.includes(';'),
  };

  const passed = Object.values(checks).every(Boolean);
  
  if (!passed) {
    console.error('Quality check failed:', checks);
  }

  return passed;
}
```

---

## Expected Results

### Before (Generic Garbage):
```
"Ever start a project with no clue where it'll take you?

That was me with Mem Bridge. Just a simple idea to help communities...

Collaboration was the game-changer..."
```

**Issues:**
- Generic opening ✗
- Made-up story ✗
- Corporate speak ✗
- No personality ✗

### After (Your Voice):
```
"The Mem bridge hit 100 users this week.

Still kinda surreal.

Started because I was manually copying 250 highlights like an idiot. Friday night I snapped and just built the thing.

What's wild is watching people use something you built for yourself..."
```

**Matches:**
- Uses your opening pattern ✓
- Your actual story ✓
- Your phrases ("like an idiot", "I snapped") ✓
- Your structure ✓
- Your tone ✓

---

## Implementation Order

1. ✅ Create voice DNA extractor (Step 1)
2. ✅ Create enforced generator (Step 2)
3. ✅ Update agent to use it (Step 3)
4. Add caching (Step 4)
5. Create test endpoint (Step 6)
6. Validate and iterate

This system FORCES authentic voice by:
- Studying your actual posts deeply
- Extracting specific patterns
- Building ultra-specific prompts
- Validating output
- Regenerating if score < 7
- Cleaning AI artifacts

No more generic LinkedIn slop.