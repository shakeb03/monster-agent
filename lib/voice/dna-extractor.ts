import OpenAI from 'openai';
import { createAdminClient } from '@/lib/supabase/admin';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export interface VoiceDNA {
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
  const supabase = createAdminClient();

  console.log('[voice-dna] Extracting voice DNA for user:', userId);

  // Get user's top 10 posts (full text) - try engagement_rate first, fallback to recent
  let { data: posts } = await supabase
    .from('linkedin_posts')
    .select('post_text, engagement_rate')
    .eq('user_id', userId)
    .not('engagement_rate', 'is', null)
    .order('engagement_rate', { ascending: false })
    .limit(10);

  // Fallback to recent posts if no engagement data
  if (!posts || posts.length === 0) {
    console.log('[voice-dna] No posts with engagement, trying recent posts');
    const { data: recentPosts } = await supabase
      .from('linkedin_posts')
      .select('post_text, engagement_rate')
      .eq('user_id', userId)
      .order('posted_at', { ascending: false })
      .limit(10);
    
    posts = recentPosts;
  }

  if (!posts || posts.length === 0) {
    throw new Error('No posts to extract voice from');
  }

  console.log('[voice-dna] Analyzing', posts.length, 'posts');

  // FIXED: Ultra-specific prompt with EXACT schema
  const analysisPrompt = `You are a writing analyst. Extract the author's unique writing DNA from these LinkedIn posts.

POSTS:
${posts.map((p, i) => `
=== POST ${i + 1}${p.engagement_rate ? ` (${p.engagement_rate}% engagement)` : ''} ===
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
    console.error('[voice-dna] Extraction missing keys:', missingKeys);
    console.error('[voice-dna] Received keys:', Object.keys(extracted));
    throw new Error(`Voice DNA extraction failed. Missing: ${missingKeys.join(', ')}`);
  }

  console.log('[voice-dna] Extracted patterns:', Object.keys(extracted));

  // Process and structure
  const allText = posts.map(p => p.post_text).join(' ');
  
  // Calculate metrics
  const sentences = allText.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = allText.split(/\s+/);
  const avgSentenceLength = words.length / sentences.length;
  
  const paragraphs = posts.map(p => p.post_text.split('\n\n').filter(para => para.trim()));
  const avgParagraphLength = paragraphs.flat().length / posts.length;

  console.log('[voice-dna] Metrics - Avg sentence length:', Math.round(avgSentenceLength), 'Avg paragraphs:', Math.round(avgParagraphLength));

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
    avgSentenceLength: Math.round(avgSentenceLength),
    avgParagraphLength: Math.round(avgParagraphLength),
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
  console.log('[voice-dna] Voice DNA extracted:');
  console.log('[voice-dna] - Hook patterns:', voiceDNA.hookPatterns.length);
  console.log('[voice-dna] - Common phrases:', voiceDNA.commonPhrases.length);
  console.log('[voice-dna] - Never uses:', voiceDNA.neverUses.length);
  console.log('[voice-dna] - Avg sentence length:', voiceDNA.avgSentenceLength);

  return voiceDNA;
}

// Step 2: Emergency fallback voice DNA
export function getEmergencyVoiceDNA(): VoiceDNA {
  console.log('[voice-dna] Using emergency voice DNA');
  
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

