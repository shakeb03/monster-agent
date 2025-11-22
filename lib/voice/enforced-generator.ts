import OpenAI from 'openai';
import { createAdminClient } from '@/lib/supabase/admin';
import { extractVoiceDNA, VoiceDNA } from './cache';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function generateWithEnforcedVoice(
  userId: string,
  topic: string,
  angle: string
): Promise<{ post: string; voiceScore: number; issues: string[] }> {
  
  const supabase = createAdminClient();

  console.log('[enforced-voice] Generating for topic:', topic, 'angle:', angle);

  // Step 1: Extract voice DNA
  console.log('[enforced-voice] === VOICE DNA EXTRACTION ===');
  const voiceDNA = await extractVoiceDNA(userId);

  // VALIDATE voice DNA has data
  console.log('[enforced-voice] Hook patterns:', voiceDNA.hookPatterns);
  console.log('[enforced-voice] Common phrases:', voiceDNA.commonPhrases);
  console.log('[enforced-voice] Never uses:', voiceDNA.neverUses);
  
  validateVoiceDNAComplete(voiceDNA);

  // Step 2: Get user's actual posts for examples
  let { data: posts } = await supabase
    .from('linkedin_posts')
    .select('post_text, engagement_rate')
    .eq('user_id', userId)
    .not('engagement_rate', 'is', null)
    .order('engagement_rate', { ascending: false })
    .limit(3);

  // Fallback to recent posts
  if (!posts || posts.length === 0) {
    const { data: recentPosts } = await supabase
      .from('linkedin_posts')
      .select('post_text, engagement_rate')
      .eq('user_id', userId)
      .order('posted_at', { ascending: false })
      .limit(3);
    
    posts = recentPosts;
  }

  if (!posts || posts.length === 0) {
    throw new Error('No posts available');
  }

  console.log('[enforced-voice] Using', posts.length, 'example posts');

  // Step 3: Build ULTRA-SPECIFIC prompt
  const prompt = buildVoiceClonePrompt(voiceDNA, posts, topic, angle);

  // Step 4: Generate with high temperature
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

  console.log('[enforced-voice] Initial generation complete');

  // POST-PROCESSING: Clean AI artifacts and enforce formatting
  generatedPost = cleanAIArtifacts(generatedPost, voiceDNA);
  generatedPost = enforceFormattingRules(generatedPost, voiceDNA);

  // Step 6: Validate voice match
  const validation = await validateVoiceMatch(generatedPost, voiceDNA, posts);

  console.log('[enforced-voice] Voice score:', validation.score);

  // Step 7: Regenerate if score too low
  if (validation.score < 7) {
    console.log(`[enforced-voice] Voice score too low (${validation.score}/10). Issues:`, validation.issues);
    console.log('[enforced-voice] Regenerating with stricter prompt...');
    
    // Try again with even stricter prompt
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
      max_tokens: 600,
    });

    generatedPost = retryResponse.choices[0].message.content || '';
    generatedPost = cleanAIArtifacts(generatedPost, voiceDNA);
    generatedPost = enforceFormattingRules(generatedPost, voiceDNA);
    
    console.log('[enforced-voice] Regenerated post');
  }

  // Final validation
  const finalValidation = await validateVoiceMatch(generatedPost, voiceDNA, posts);

  console.log('[enforced-voice] Final voice score:', finalValidation.score);

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

function buildVoiceClonePrompt(
  voiceDNA: VoiceDNA,
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

${posts.map((p, i) => `POST ${i + 1}${p.engagement_rate ? ` (${p.engagement_rate}% engagement)` : ''}:
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

function buildStricterPrompt(
  voiceDNA: VoiceDNA,
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

function cleanAIArtifacts(post: string, voiceDNA: VoiceDNA): string {
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

function enforceFormattingRules(post: string, voiceDNA: VoiceDNA): string {
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
    console.error('[voice-validation] Voice DNA incomplete:', issues);
    throw new Error(`Voice DNA incomplete: ${issues.join(', ')}`);
  }
  
  console.log('[voice-validation] ✓ Voice DNA validation passed');
  console.log('[voice-validation] - Hook patterns:', voiceDNA.hookPatterns.length);
  console.log('[voice-validation] - Common phrases:', voiceDNA.commonPhrases.length);
  console.log('[voice-validation] - Forbidden phrases:', voiceDNA.neverUses.length);
}

async function validateVoiceMatch(
  generated: string,
  voiceDNA: VoiceDNA,
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

