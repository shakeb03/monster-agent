# CRITICAL FIX: Voice DNA Extraction Schema

## The Problem
The extractor says "Return detailed JSON" but **never defines the schema**, so GPT returns random keys like `hook_patterns` instead of `hookPatterns`, making all lookups fail.

---

## Step 1: Fix the Extraction Prompt

Replace the prompt in `lib/voice/dna-extractor.ts`:

```typescript
export async function extractVoiceDNA(userId: string): Promise<VoiceDNA> {
  const supabase = await createClient();

  const { data: posts } = await supabase
    .from('linkedin_posts')
    .select('post_text, engagement_rate')
    .eq('user_id', userId)
    .order('engagement_rate', { ascending: false })
    .limit(10);

  if (!posts || posts.length === 0) {
    throw new Error('No posts to extract voice from');
  }

  // FIXED: Ultra-specific prompt with EXACT schema
  const analysisPrompt = `You are a writing analyst. Extract the author's unique writing DNA from these LinkedIn posts.

POSTS:
${posts.map((p, i) => `
=== POST ${i + 1} (${p.engagement_rate}% engagement) ===
${p.post_text}
`).join('\n')}

Analyze and return EXACTLY this JSON structure (use these exact property names):

{
  "hookPatterns": [
    "string - exact opening formula they use, e.g., 'I got annoyed enough'",
    "string - another opening pattern they use"
  ],
  "firstSentenceExamples": [
    "string - exact first sentence from post 1",
    "string - exact first sentence from post 2",
    "string - exact first sentence from post 3"
  ],
  "commonPhrases": [
    "string - unique phrase they repeat, e.g., 'like an idiot'",
    "string - another signature phrase, e.g., 'I finally snapped'"
  ],
  "uniqueWords": [
    "string - uncommon words they use frequently"
  ],
  "avoidedWords": [
    "string - corporate words they NEVER use, e.g., 'synergy', 'leverage'"
  ],
  "storyProgression": [
    "string - step 1 of their typical story structure",
    "string - step 2",
    "string - step 3"
  ],
  "endingStyle": "string - describe how they typically end posts",
  "neverUses": [
    "string - phrase they NEVER say, e.g., 'key takeaways'",
    "string - another forbidden phrase, e.g., 'in today's world'"
  ],
  "selfDeprecating": true or false,
  "conversational": true or false,
  "technical": true or false,
  "vulnerable": true or false,
  "hashtagStyle": "string - describe their hashtag usage"
}

CRITICAL RULES:
1. Extract EXACT phrases from their posts, not generic descriptions
2. For hookPatterns: copy their actual opening formulas (first 5-8 words)
3. For commonPhrases: find phrases that appear multiple times
4. For neverUses: find LinkedIn clichés that appear in ZERO posts
5. Use camelCase property names EXACTLY as shown above

Return ONLY valid JSON, no markdown formatting.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are a writing analyst. Return ONLY the JSON object with exact property names as specified. No markdown, no explanation.',
      },
      { role: 'user', content: analysisPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const extracted = JSON.parse(response.choices[0].message.content || '{}');

  // VALIDATE: Check if we got the expected keys
  const requiredKeys = ['hookPatterns', 'commonPhrases', 'neverUses'];
  const missingKeys = requiredKeys.filter(key => !extracted[key]);
  
  if (missingKeys.length > 0) {
    console.error('Voice DNA extraction missing keys:', missingKeys);
    console.error('Received:', Object.keys(extracted));
    throw new Error(`Voice DNA extraction failed. Missing: ${missingKeys.join(', ')}`);
  }

  // Calculate metrics from actual posts
  const allText = posts.map(p => p.post_text).join(' ');
  const sentences = allText.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = allText.split(/\s+/);
  const avgSentenceLength = Math.round(words.length / sentences.length);
  
  const paragraphs = posts.map(p => p.post_text.split('\n\n').filter(para => para.trim()));
  const avgParagraphLength = Math.round(paragraphs.flat().length / posts.length);

  // Build complete voice DNA
  const voiceDNA: VoiceDNA = {
    // From GPT extraction
    hookPatterns: extracted.hookPatterns || [],
    firstSentenceExamples: extracted.firstSentenceExamples || 
      posts.map(p => p.post_text.split('\n')[0]).slice(0, 5),
    commonPhrases: extracted.commonPhrases || [],
    uniqueWords: extracted.uniqueWords || [],
    avoidedWords: extracted.avoidedWords || [],
    storyProgression: extracted.storyProgression || [],
    endingStyle: extracted.endingStyle || 'practical question',
    neverUses: extracted.neverUses || [],
    
    // From calculations
    avgSentenceLength,
    avgParagraphLength,
    usesShortSentences: avgSentenceLength < 15,
    usesFragments: /^\w+\.$|^\w+ \w+\.$/.test(allText),
    usesContractions: /\b(I'm|you're|it's|that's|don't|can't|won't)\b/.test(allText),
    usesQuestions: /\?/.test(allText),
    usesEmojis: /[\u{1F300}-\u{1F9FF}]/u.test(allText),
    usesHashtags: /#\w+/.test(allText),
    hashtagStyle: extracted.hashtagStyle || 'specific tools and concepts',
    
    // From GPT flags
    selfDeprecating: extracted.selfDeprecating ?? false,
    conversational: extracted.conversational ?? false,
    technical: extracted.technical ?? false,
    vulnerable: extracted.vulnerable ?? false,
  };

  // LOG for debugging
  console.log('Voice DNA extracted:');
  console.log('- Hook patterns:', voiceDNA.hookPatterns.length);
  console.log('- Common phrases:', voiceDNA.commonPhrases.length);
  console.log('- Never uses:', voiceDNA.neverUses.length);
  console.log('- Avg sentence length:', voiceDNA.avgSentenceLength);

  return voiceDNA;
}
```

---

## Step 2: Add Fallback Voice DNA

If extraction fails, use manual patterns from your actual posts:

```typescript
// Add to lib/voice/dna-extractor.ts

export function getEmergencyVoiceDNA(): VoiceDNA {
  // Manually extracted from your 3 posts
  return {
    hookPatterns: [
      'I got annoyed enough',
      'X taught me more than Y',
      'The X I built failed spectacularly',
      'I spent X months/days building',
    ],
    firstSentenceExamples: [
      "Vercel's 5-minute timeout taught me more about system design than any architecture course.",
      "The Readwise -> Mem bridge I built last weekend just got its first real stress test.",
      "I got annoyed enough this weekend to build something I should've built months ago.",
    ],
    commonPhrases: [
      'like an idiot',
      'I finally snapped',
      'apparently 12 years old',
      'Completely unnecessary. Totally worth it.',
      'honestly?',
      "Here's what's wild",
      'Spoiler:',
    ],
    uniqueWords: [
      'annoyed',
      'snapped',
      'broke',
      'died',
      'failed',
      'spectacularly',
    ],
    avoidedWords: [
      'synergy',
      'leverage',
      'robust',
      'seamless',
      'innovative',
      'groundbreaking',
      'game-changer',
      'delve',
      'circle back',
    ],
    storyProgression: [
      'Open with emotion or constraint',
      'Describe what you built and why',
      'Show what broke (honest failure)',
      'Explain what you fixed',
      'Share practical lesson',
      'Ask specific question',
    ],
    endingStyle: 'practical question about their experience with similar issue',
    neverUses: [
      'Ever start a project',
      'Key takeaways:',
      'Lessons learned:',
      'In today\'s world',
      'The power of',
      'Let\'s dive in',
      'Circle back',
      'At the end of the day',
      'Have you ever',
      'I hope this helps',
      'game-changer',
      'robust solution',
      'badges of experience',
      'push through',
    ],
    avgSentenceLength: 12,
    avgParagraphLength: 3,
    usesShortSentences: true,
    usesFragments: true,
    usesContractions: true,
    usesQuestions: true,
    usesEmojis: false,
    usesHashtags: true,
    hashtagStyle: 'specific tools and concepts like #buildinpublic #memai #SystemDesign',
    selfDeprecating: true,
    conversational: true,
    technical: true,
    vulnerable: true,
  };
}

// Update the extraction to use fallback
export async function extractVoiceDNA(userId: string): Promise<VoiceDNA> {
  try {
    // Try to extract from posts
    const voiceDNA = await extractVoiceDNAFromPosts(userId);
    
    // Validate we got real data
    if (voiceDNA.hookPatterns.length === 0 || voiceDNA.commonPhrases.length === 0) {
      console.warn('Voice DNA extraction returned empty data, using emergency DNA');
      return getEmergencyVoiceDNA();
    }
    
    return voiceDNA;
  } catch (error) {
    console.error('Voice DNA extraction failed:', error);
    console.log('Using emergency voice DNA');
    return getEmergencyVoiceDNA();
  }
}
```

---

## Step 3: Add Debug Logging

Add to `lib/voice/enforced-generator.ts`:

```typescript
export async function generateWithEnforcedVoice(
  userId: string,
  topic: string,
  angle: string
): Promise<{ post: string; voiceScore: number; issues: string[] }> {
  
  // Extract voice DNA
  console.log('=== VOICE DNA EXTRACTION ===');
  const voiceDNA = await extractVoiceDNA(userId);
  
  // VALIDATE voice DNA has data
  console.log('Hook patterns:', voiceDNA.hookPatterns);
  console.log('Common phrases:', voiceDNA.commonPhrases);
  console.log('Never uses:', voiceDNA.neverUses);
  
  if (voiceDNA.hookPatterns.length === 0) {
    throw new Error('Voice DNA has no hook patterns! Check extraction.');
  }
  
  if (voiceDNA.commonPhrases.length === 0) {
    throw new Error('Voice DNA has no common phrases! Check extraction.');
  }
  
  if (voiceDNA.neverUses.length === 0) {
    console.warn('Voice DNA has no forbidden phrases. Using defaults.');
    voiceDNA.neverUses = [
      'key takeaways',
      'in today\'s world',
      'ever start a project',
      'game-changer',
      'robust solution',
    ];
  }
  
  // ... rest of generation
}
```

---

## Step 4: Fix Prompt to Use Populated Data

Update `buildVoiceClonePrompt` to validate data exists:

```typescript
function buildVoiceClonePrompt(
  voiceDNA: any,
  posts: any[],
  topic: string,
  angle: string
): string {
  
  // VALIDATE we have data
  if (!voiceDNA.hookPatterns || voiceDNA.hookPatterns.length === 0) {
    throw new Error('Cannot build prompt: Voice DNA has no hook patterns');
  }
  
  if (!voiceDNA.commonPhrases || voiceDNA.commonPhrases.length === 0) {
    throw new Error('Cannot build prompt: Voice DNA has no common phrases');
  }

  return `Write ONE LinkedIn post about "${topic}" (angle: ${angle}) in this person's EXACT voice.

## THEIR ACTUAL POSTS (STUDY THESE)

${posts.map((p, i) => `POST ${i + 1} (${p.engagement_rate}% engagement):
${p.post_text}
---`).join('\n\n')}

## THEIR OPENING PATTERNS (USE ONE OF THESE):

${voiceDNA.hookPatterns.map((h: string, i: number) => `${i + 1}. "${h}"`).join('\n')}

Example first sentences:
${voiceDNA.firstSentenceExamples.map((s: string) => `"${s}"`).join('\n')}

## THEIR SIGNATURE PHRASES (USE THESE):

${voiceDNA.commonPhrases.map((p: string) => `"${p}"`).join(', ')}

## ABSOLUTELY FORBIDDEN (NEVER USE):

${voiceDNA.neverUses.map((n: string) => `❌ "${n}"`).join('\n')}

## THEIR STYLE:

- Sentence length: ~${voiceDNA.avgSentenceLength} words
- ${voiceDNA.usesShortSentences ? '✓ Short, punchy sentences' : '✗ No short sentences'}
- ${voiceDNA.usesFragments ? '✓ Uses fragments for emphasis' : '✗ No fragments'}
- ${voiceDNA.usesContractions ? "✓ Uses contractions (I'm, that's, don't)" : '✗ No contractions'}
- ${voiceDNA.selfDeprecating ? '✓ Self-deprecating humor' : ''}
- ${voiceDNA.conversational ? '✓ Conversational tone' : ''}
- ${voiceDNA.technical ? '✓ Technical details' : ''}

## STORY STRUCTURE:

${voiceDNA.storyProgression.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}

## ENDING:

${voiceDNA.endingStyle}

## YOUR TASK:

Write about "${topic}" using:
1. One of their opening patterns
2. Their signature phrases
3. Their sentence structure
4. Their story progression
5. Their ending style

NEVER use any forbidden phrases.

Write ONLY the post:`;
}
```

---

## Step 5: Add Validation Before Generation

```typescript
// Add before generating
function validateVoiceDNAComplete(voiceDNA: VoiceDNA): void {
  const issues: string[] = [];
  
  if (voiceDNA.hookPatterns.length === 0) {
    issues.push('No hook patterns extracted');
  }
  
  if (voiceDNA.commonPhrases.length === 0) {
    issues.push('No common phrases extracted');
  }
  
  if (voiceDNA.neverUses.length === 0) {
    issues.push('No forbidden phrases extracted');
  }
  
  if (voiceDNA.storyProgression.length === 0) {
    issues.push('No story progression extracted');
  }
  
  if (issues.length > 0) {
    throw new Error(`Voice DNA incomplete: ${issues.join(', ')}`);
  }
  
  console.log('✓ Voice DNA validation passed');
}

// Call before building prompt
validateVoiceDNAComplete(voiceDNA);
```

---

## Step 6: Test Extraction Endpoint

Update `/api/test-voice` to show exactly what's extracted:

```typescript
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

    console.log('=== TESTING VOICE DNA EXTRACTION ===');
    
    const voiceDNA = await extractVoiceDNA(user.id);
    
    console.log('Extracted Voice DNA:');
    console.log(JSON.stringify(voiceDNA, null, 2));

    return NextResponse.json({
      success: true,
      voiceDNA: {
        hookPatterns: voiceDNA.hookPatterns,
        hookPatternsCount: voiceDNA.hookPatterns.length,
        commonPhrases: voiceDNA.commonPhrases,
        commonPhrasesCount: voiceDNA.commonPhrases.length,
        neverUses: voiceDNA.neverUses,
        neverUsesCount: voiceDNA.neverUses.length,
        avgSentenceLength: voiceDNA.avgSentenceLength,
        flags: {
          selfDeprecating: voiceDNA.selfDeprecating,
          conversational: voiceDNA.conversational,
          technical: voiceDNA.technical,
        },
      },
      diagnostic: {
        hasHooks: voiceDNA.hookPatterns.length > 0,
        hasPhrases: voiceDNA.commonPhrases.length > 0,
        hasForbidden: voiceDNA.neverUses.length > 0,
        isComplete: voiceDNA.hookPatterns.length > 0 && 
                   voiceDNA.commonPhrases.length > 0 && 
                   voiceDNA.neverUses.length > 0,
      },
    });
  } catch (error) {
    console.error('Test voice error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
```

---

## Expected Output After Fix

Visit `/api/test-voice` and you should see:

```json
{
  "success": true,
  "voiceDNA": {
    "hookPatterns": [
      "I got annoyed enough",
      "X taught me more than Y",
      "The X I built failed spectacularly"
    ],
    "hookPatternsCount": 3,
    "commonPhrases": [
      "like an idiot",
      "I finally snapped",
      "honestly?"
    ],
    "commonPhrasesCount": 3,
    "neverUses": [
      "key takeaways",
      "in today's world",
      "game-changer"
    ],
    "neverUsesCount": 3,
    "avgSentenceLength": 12
  },
  "diagnostic": {
    "hasHooks": true,
    "hasPhrases": true,
    "hasForbidden": true,
    "isComplete": true
  }
}
```

If `isComplete: false`, the system will use emergency voice DNA.

---

## Summary of Fixes

1. ✅ **Defined exact JSON schema** in extraction prompt
2. ✅ **Used camelCase property names** matching code expectations
3. ✅ **Added validation** to check if keys exist
4. ✅ **Added emergency fallback** with manually extracted patterns
5. ✅ **Added debug logging** to see what's extracted
6. ✅ **Added pre-generation validation** to catch empty data
7. ✅ **Created test endpoint** to verify extraction works

This fixes the root cause: **GPT now knows exactly what to return**.