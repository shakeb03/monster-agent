# CRITICAL FIX 2: Nuclear Validation & Voice Enforcement

## Problem
Even with voice DNA populated, the generator produces softened, corporate versions of your voice instead of matching it exactly.

**Examples:**
- AI: "faced a challenge" → You: "failed spectacularly"
- AI: "robust product" → You: "actually works"
- AI: Uses asterisks (*) → You: Use dashes (-)

---

## Step 1: Update Emergency Voice DNA with More Forbidden Phrases

Replace `getEmergencyVoiceDNA()` in `lib/voice/dna-extractor.ts`:

```typescript
export function getEmergencyVoiceDNA(): VoiceDNA {
  return {
    hookPatterns: [
      'I got annoyed enough',
      'X taught me more than Y',
      'The X I built failed spectacularly',
      'I spent X months/days building',
      'X just got its first/second stress test',
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
      'everything broke',
      'everything died',
      'failed spectacularly',
      'wasn\'t cutting it',
      'actually works',
      'actually reliable',
    ],
    uniqueWords: [
      'annoyed',
      'snapped',
      'broke',
      'died',
      'failed',
      'spectacularly',
      'crashed',
      'exploded',
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
      'viable',
      'accommodate',
      'revamp',
      'implement',
      'unforeseen',
      'tackling',
      'grace',
      'imploded',
      'overhaul',
    ],
    storyProgression: [
      'Open with specific failure or emotion',
      'Describe what you built and why',
      'Show what broke with honest details',
      'Explain what you fixed with specific constraints',
      'Share practical technical lesson',
      'Ask specific question about their experience',
    ],
    endingStyle: 'practical question about their specific experience with similar technical issue',
    neverUses: [
      // Generic openings
      'Ever start a project',
      'Have you ever',
      'In today\'s world',
      'The power of',
      
      // Corporate speak
      'key takeaways',
      'lessons learned:',
      'what i discovered:',
      'here\'s what broke:', // You use natural flow, not headers
      'what i implemented:', // You use natural flow
      'game-changer',
      'robust product',
      'robust solution',
      'seamless integration',
      'badges of experience',
      'push through',
      'endless planning',
      
      // Softened language
      'faced a challenge',
      'faced a real technical challenge',
      'needed an overhaul',
      'needed a complete overhaul',
      'things imploded',
      'no longer viable',
      'revamping the system',
      'real-world loads with grace',
      'handling real-world loads',
      'tackling unforeseen',
      'accommodate high-volume',
      'unforeseen limitations',
      
      // Formal phrases
      'inquiries about',
      'a message from',
      'suggesting a deeper',
      
      // Motivational
      'it\'s gratifying',
      'the progress is real',
      'contemplating whether',
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
```

---

## Step 2: Add Nuclear Validation Rules

Replace `validateVoiceMatch()` in `lib/voice/enforced-generator.ts`:

```typescript
async function validateVoiceMatch(
  generated: string,
  voiceDNA: any,
  actualPosts: any[]
): Promise<{ score: number; issues: string[] }> {
  const issues: string[] = [];
  let score = 10;

  // === HARD REJECTS (Score = 0) ===

  // 1. WRONG BULLET FORMAT
  if (/^\*/m.test(generated)) {
    return {
      score: 0,
      issues: ['HARD REJECT: Uses asterisk bullets (*). User ONLY uses dashes (-)'],
    };
  }

  // 2. FORBIDDEN PHRASES (Any single match = reject)
  const strictlyForbidden = [
    'faced a challenge',
    'faced a real technical challenge',
    'needed an overhaul',
    'needed a complete overhaul',
    'things imploded',
    'no longer viable',
    'revamping the system',
    'robust product',
    'robust solution',
    'real-world loads with grace',
    'handling real-world loads',
    'tackling unforeseen',
    'accommodate high-volume',
    'unforeseen limitations',
    'key takeaways',
    'what i discovered:',
    'what i implemented:',
    'here\'s what broke:',
    'badges of experience',
    'push through',
    'endless planning',
    'it\'s gratifying',
    'the progress is real',
    'contemplating whether',
    'inquiries about',
    'suggesting a deeper',
  ];

  for (const forbidden of strictlyForbidden) {
    if (generated.toLowerCase().includes(forbidden.toLowerCase())) {
      return {
        score: 0,
        issues: [`HARD REJECT: Contains forbidden phrase: "${forbidden}"`],
      };
    }
  }

  // 3. CORPORATE VOCABULARY (instant reject words)
  const corporateWords = [
    'viable',
    'accommodate',
    'revamp',
    'unforeseen',
    'tackling',
    'overhaul',
    'imploded',
    'contemplating',
    'gratifying',
  ];

  for (const word of corporateWords) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    if (regex.test(generated)) {
      return {
        score: 0,
        issues: [`HARD REJECT: Contains corporate word: "${word}". Use simple vocabulary.`],
      };
    }
  }

  // === SEVERE PENALTIES (Major deductions) ===

  // 4. MUST USE SIGNATURE PHRASES
  const signaturePhrases = voiceDNA.commonPhrases || [];
  const usesSignaturePhrase = signaturePhrases.some((phrase: string) =>
    generated.toLowerCase().includes(phrase.toLowerCase())
  );

  if (!usesSignaturePhrase && signaturePhrases.length > 0) {
    issues.push('CRITICAL: Does not use ANY signature phrases');
    score -= 4;
  }

  // 5. MUST USE FAILURE WORDS FOR FAILURE STORIES
  const failureWords = ['broke', 'failed', 'died', 'crashed', 'exploded'];
  const hasFailureWord = failureWords.some(word =>
    generated.toLowerCase().includes(word)
  );

  if (!hasFailureWord) {
    issues.push('Missing failure vocabulary (broke, failed, died, crashed)');
    score -= 3;
  }

  // 6. CHECK SENTENCE LENGTH
  const sentences = generated.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = generated.split(/\s+/);
  const avgLength = words.length / sentences.length;
  const lengthDiff = Math.abs(avgLength - voiceDNA.avgSentenceLength);

  if (lengthDiff > 5) {
    issues.push(`Sentence length mismatch: ${Math.round(avgLength)} vs ${voiceDNA.avgSentenceLength} expected`);
    score -= 2;
  }

  // 7. CHECK CONTRACTIONS MATCH
  const hasContractions = /\b(I'm|you're|it's|that's|don't|can't|won't)\b/.test(generated);
  if (hasContractions !== voiceDNA.usesContractions) {
    issues.push(voiceDNA.usesContractions ? 'Should use contractions' : 'Should not use contractions');
    score -= 1;
  }

  // 8. CHECK FOR SOFTENED LANGUAGE
  const softenedPhrases = [
    { soft: 'challenge', hard: 'problem/issue' },
    { soft: 'needed', hard: 'had to' },
    { soft: 'inquiries', hard: 'questions' },
    { soft: 'suggesting', hard: 'said/asked' },
  ];

  for (const { soft, hard } of softenedPhrases) {
    if (generated.toLowerCase().includes(soft)) {
      issues.push(`Uses softened language: "${soft}" (should be: ${hard})`);
      score -= 1;
    }
  }

  // 9. MUST INCLUDE SPECIFIC NUMBERS/DETAILS
  const hasNumbers = /\d+/.test(generated);
  if (!hasNumbers) {
    issues.push('No specific numbers. Add concrete details (5000 items, 300 seconds, etc.)');
    score -= 2;
  }

  // === GPT SIMILARITY CHECK ===

  const similarityPrompt = `Compare this generated post to the user's actual posts for voice match:

GENERATED:
${generated}

ACTUAL POSTS:
${actualPosts.map(p => p.post_text).join('\n---\n')}

Rate similarity 1-10 focusing on:
- Vocabulary match (uses same words/phrases)
- Tone match (same level of formality)
- Structure match (same flow and rhythm)
- Personality match (same humor and self-awareness)

10 = perfect match, could be their post
7-9 = very close, minor differences
4-6 = similar topic but different voice
1-3 = completely different voice

Return JSON: { "similarity": number, "reasoning": "specific differences" }`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: similarityPrompt }],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const result = JSON.parse(response.choices[0].message.content || '{"similarity": 5}');

  if (result.similarity < 7) {
    issues.push(`GPT similarity too low: ${result.similarity}/10. ${result.reasoning}`);
  }

  // Final score is minimum of rule-based and GPT score
  const finalScore = Math.min(score, result.similarity);

  return {
    score: Math.max(0, finalScore),
    issues,
  };
}
```

---

## Step 3: Add Post-Processing to Enforce Formatting

Add this function to `lib/voice/enforced-generator.ts`:

```typescript
function enforceFormattingRules(post: string, voiceDNA: any): string {
  let cleaned = post;

  // 1. Fix bullet format: asterisks → dashes
  cleaned = cleaned.replace(/^\* /gm, '- ');

  // 2. Replace corporate vocabulary with simple words
  const replacements: Record<string, string> = {
    'robust': 'reliable',
    'viable': 'working',
    'accommodate': 'handle',
    'revamp': 'fix',
    'revamping': 'fixing',
    'implement': 'add',
    'implemented': 'added',
    'tackling': 'dealing with',
    'unforeseen': 'unexpected',
    'inquiries': 'questions',
    'suggesting': 'asking about',
    'contemplating': 'thinking about',
    'gratifying': 'satisfying',
  };

  for (const [corporate, simple] of Object.entries(replacements)) {
    const regex = new RegExp(`\\b${corporate}\\b`, 'gi');
    cleaned = cleaned.replace(regex, simple);
  }

  // 3. Replace softened phrases with direct ones
  const phraseReplacements: Record<string, string> = {
    'faced a challenge': 'broke',
    'faced a real technical challenge': 'failed',
    'needed an overhaul': 'broke',
    'things imploded': 'everything broke',
    'no longer viable': "wasn't working",
    'real-world loads': 'real users',
    'with grace': '', // Just remove it
  };

  for (const [soft, hard] of Object.entries(phraseReplacements)) {
    const regex = new RegExp(soft, 'gi');
    cleaned = cleaned.replace(regex, hard);
  }

  // 4. Remove em dashes and semicolons
  cleaned = cleaned.replace(/—/g, '-');
  cleaned = cleaned.replace(/;/g, '.');

  // 5. Remove markdown formatting
  cleaned = cleaned.replace(/\*\*/g, '');
  cleaned = cleaned.replace(/\*/g, '');

  return cleaned.trim();
}
```

---

## Step 4: Update Generation Flow with Post-Processing

Update `generateWithEnforcedVoice()` in `lib/voice/enforced-generator.ts`:

```typescript
export async function generateWithEnforcedVoice(
  userId: string,
  topic: string,
  angle: string
): Promise<{ post: string; voiceScore: number; issues: string[] }> {
  
  console.log('=== VOICE DNA EXTRACTION ===');
  const voiceDNA = await extractVoiceDNA(userId);
  
  // Validate voice DNA has data
  validateVoiceDNAComplete(voiceDNA);
  
  const supabase = await createClient();
  const { data: posts } = await supabase
    .from('linkedin_posts')
    .select('post_text, engagement_rate')
    .eq('user_id', userId)
    .order('engagement_rate', { ascending: false })
    .limit(3);

  if (!posts || posts.length === 0) {
    throw new Error('No posts available');
  }

  const prompt = buildVoiceClonePrompt(voiceDNA, posts, topic, angle);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a writing mimic. Match their EXACT voice - vocabulary, tone, structure, everything.

CRITICAL:
- Use THEIR words, not synonyms
- Use DASHES (-) for lists, never asterisks
- Include specific numbers and details
- Be direct, not softened
- Sound like them texting, not writing formally`,
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.9,
    max_tokens: 600,
  });

  let generatedPost = response.choices[0].message.content || '';

  // POST-PROCESSING: Clean AI artifacts and enforce formatting
  generatedPost = cleanAIArtifacts(generatedPost, voiceDNA);
  generatedPost = enforceFormattingRules(generatedPost, voiceDNA);

  // VALIDATION
  const validation = await validateVoiceMatch(generatedPost, voiceDNA, posts);

  // REGENERATE if score < 7
  if (validation.score < 7) {
    console.log(`Voice score too low (${validation.score}/10). Issues:`, validation.issues);
    console.log('Regenerating with stricter prompt...');
    
    const stricterPrompt = buildStricterPrompt(voiceDNA, posts, topic, angle, validation.issues);
    const retryResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'Match the voice EXACTLY. Be radical about copying their style. Direct, not softened.',
        },
        { role: 'user', content: stricterPrompt },
      ],
      temperature: 0.9,
    });

    generatedPost = retryResponse.choices[0].message.content || '';
    generatedPost = cleanAIArtifacts(generatedPost, voiceDNA);
    generatedPost = enforceFormattingRules(generatedPost, voiceDNA);
  }

  // FINAL VALIDATION
  const finalValidation = await validateVoiceMatch(generatedPost, voiceDNA, posts);

  // REJECT if still too low
  if (finalValidation.score < 5) {
    throw new Error(
      `Generated content failed validation (score: ${finalValidation.score}/10). Issues: ${finalValidation.issues.join(', ')}`
    );
  }

  return {
    post: generatedPost,
    voiceScore: finalValidation.score,
    issues: finalValidation.issues,
  };
}
```

---

## Step 5: Update Stricter Prompt

Update `buildStricterPrompt()`:

```typescript
function buildStricterPrompt(
  voiceDNA: any,
  posts: any[],
  topic: string,
  angle: string,
  issues: string[]
): string {
  return `PREVIOUS ATTEMPT FAILED. Issues found:
${issues.map(i => `❌ ${i}`).join('\n')}

Here are their ACTUAL posts. Study them CAREFULLY:

${posts.map((p, i) => `POST ${i + 1}:
${p.post_text}
---`).join('\n\n')}

Write about "${topic}" (${angle}) but THIS TIME:

1. Copy their EXACT opening style
   Examples: "${voiceDNA.hookPatterns.slice(0, 2).join('", "')}"

2. Use their EXACT phrases (copy these word-for-word somewhere):
   ${voiceDNA.commonPhrases.slice(0, 5).map((p: string) => `"${p}"`).join(', ')}

3. Use DASHES (-) for lists, NEVER asterisks (*)

4. Use DIRECT language, not softened:
   ✗ "faced a challenge" → ✓ "broke"
   ✗ "needed an overhaul" → ✓ "failed"
   ✗ "things imploded" → ✓ "everything broke"

5. Include SPECIFIC NUMBERS:
   ✓ "5000 highlights", "300 seconds", "80 items"
   ✗ "large datasets", "many users"

6. Match their sentence length: ~${voiceDNA.avgSentenceLength} words per sentence

7. NEVER use these words:
   ${['robust', 'viable', 'accommodate', 'revamp', 'unforeseen', 'tackling'].join(', ')}

8. Sound like you're TEXTING A FRIEND, not writing formally

Be RADICAL about matching their voice. When in doubt, copy their structure more closely.

Write ONLY the post:`;
}
```

---

## Step 6: Add Validation Helper

Add to ensure voice DNA is complete:

```typescript
function validateVoiceDNAComplete(voiceDNA: VoiceDNA): void {
  const issues: string[] = [];
  
  if (!voiceDNA.hookPatterns || voiceDNA.hookPatterns.length === 0) {
    issues.push('No hook patterns extracted');
  }
  
  if (!voiceDNA.commonPhrases || voiceDNA.commonPhrases.length === 0) {
    issues.push('No common phrases extracted');
  }
  
  if (!voiceDNA.neverUses || voiceDNA.neverUses.length === 0) {
    issues.push('No forbidden phrases extracted');
  }
  
  if (issues.length > 0) {
    console.error('Voice DNA incomplete:', issues);
    throw new Error(`Voice DNA incomplete: ${issues.join(', ')}`);
  }
  
  console.log('✓ Voice DNA validation passed');
  console.log('- Hook patterns:', voiceDNA.hookPatterns.length);
  console.log('- Common phrases:', voiceDNA.commonPhrases.length);
  console.log('- Forbidden phrases:', voiceDNA.neverUses.length);
}
```

---

## Step 7: Update Test Endpoint

Update `app/api/test-voice/route.ts` to test validation:

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

    console.log('=== TESTING VOICE SYSTEM ===');
    
    const voiceDNA = await extractVoiceDNA(user.id);
    
    console.log('Voice DNA extracted:', {
      hookPatterns: voiceDNA.hookPatterns.length,
      commonPhrases: voiceDNA.commonPhrases.length,
      neverUses: voiceDNA.neverUses.length,
    });

    const result = await generateWithEnforcedVoice(
      user.id,
      'Mem bridge production issues',
      'failure story'
    );

    return NextResponse.json({
      success: true,
      voiceDNA: {
        hookPatterns: voiceDNA.hookPatterns,
        commonPhrases: voiceDNA.commonPhrases,
        neverUses: voiceDNA.neverUses.slice(0, 10), // First 10
        avgSentenceLength: voiceDNA.avgSentenceLength,
      },
      generated: {
        post: result.post,
        score: result.voiceScore,
        issues: result.issues,
      },
      validation: {
        passed: result.voiceScore >= 7,
        usesSignaturePhrases: voiceDNA.commonPhrases.some((p: string) =>
          result.post.toLowerCase().includes(p.toLowerCase())
        ),
        usesDashes: /^-/m.test(result.post),
        noAsterisks: !/^\*/m.test(result.post),
        hasForbiddenPhrases: voiceDNA.neverUses.some((n: string) =>
          result.post.toLowerCase().includes(n.toLowerCase())
        ),
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

## Expected Results After Fix

### Test Output (`/api/test-voice`):

```json
{
  "success": true,
  "generated": {
    "post": "The Mem bridge broke in production twice this week.\n\nSpoiler: Everything broke again.\n\nWithin 24 hours, I got:\n- Users with 10,000+ highlights...",
    "score": 8.5,
    "issues": []
  },
  "validation": {
    "passed": true,
    "usesSignaturePhrases": true,
    "usesDashes": true,
    "noAsterisks": true,
    "hasForbiddenPhrases": false
  }
}
```

### Rejected Examples:

```
HARD REJECT: "faced a challenge" → score 0
HARD REJECT: "* bullet point" → score 0
HARD REJECT: "robust product" → score 0
CRITICAL: No signature phrases → score 3
```

---

## Summary of Fixes

1. ✅ **Expanded forbidden phrases** - 40+ corporate/softened phrases
2. ✅ **Hard reject rules** - Wrong bullets, corporate speak = instant fail
3. ✅ **Signature phrase requirement** - Must use at least one
4. ✅ **Failure vocabulary check** - Must use broke/failed/died
5. ✅ **Post-processing** - Auto-fixes formatting and vocabulary
6. ✅ **Regeneration on failure** - Tries again with stricter prompt
7. ✅ **Complete rejection** - Score < 5 throws error instead of returning

**No more escape hatches for generic content.**