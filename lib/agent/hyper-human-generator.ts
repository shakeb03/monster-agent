import OpenAI from 'openai';
import { createAdminClient } from '@/lib/supabase/admin';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function generateHyperHumanContent(
  userId: string,
  refinedIntent: any,
  strategy: any
): Promise<string> {
  const supabase = createAdminClient();

  console.log('[hyper-human] Generating for topic:', refinedIntent.topic, 'angle:', refinedIntent.angle);

  // Get user's actual posts for voice matching
  // Try to get posts with engagement_rate first, fallback to any posts
  let { data: topPosts } = await supabase
    .from('linkedin_posts')
    .select('post_text, engagement_rate')
    .eq('user_id', userId)
    .not('engagement_rate', 'is', null)
    .order('engagement_rate', { ascending: false })
    .limit(3);

  // If no posts with engagement_rate, get any recent posts
  if (!topPosts || topPosts.length === 0) {
    console.log('[hyper-human] No posts with engagement_rate, trying recent posts');
    const { data: recentPosts } = await supabase
      .from('linkedin_posts')
      .select('post_text, engagement_rate')
      .eq('user_id', userId)
      .order('posted_at', { ascending: false })
      .limit(3);
    
    topPosts = recentPosts;
  }

  if (!topPosts || topPosts.length === 0) {
    throw new Error('No posts to learn from for hyper-human generation. Please import posts first.');
  }

  console.log('[hyper-human] Found', topPosts.length, 'posts for voice matching');

  // Analyze human writing patterns
  const post1 = topPosts[0].post_text;
  const post2 = topPosts[1]?.post_text || post1;
  
  // Extract human patterns
  const usesContractions = /\b(I'm|you're|we're|that's|it's|don't|can't|won't)\b/i.test(post1);
  const usesShortSentences = post1.split(/[.!?]/).filter(s => s.trim().length > 0).some(s => s.length < 50);
  const usesFragments = /^\w+\.$|^\w+ \w+\.$/.test(post1); // One or two word sentences
  const conversationalStart = /^(So|Well|Here's|Look|Listen|Honestly)/i.test(post1);
  const usesQuestions = /\?/.test(post1);
  const paragraphs = post1.split('\n\n').filter(p => p.trim());
  const avgParagraphLength = paragraphs.length;

  console.log('[hyper-human] Writing patterns:', {
    usesContractions,
    usesShortSentences,
    usesFragments,
    conversationalStart,
    usesQuestions,
    avgParagraphLength,
  });

  const prompt = `Write a LinkedIn post that sounds EXACTLY like a real human wrote it, not AI.

## USER'S ACTUAL POSTS (STUDY THESE)

Post 1${topPosts[0].engagement_rate ? ` (${topPosts[0].engagement_rate}% engagement)` : ''}:
"""
${post1}
"""

Post 2${topPosts[1]?.engagement_rate ? ` (${topPosts[1].engagement_rate}% engagement)` : ''}:
"""
${post2}
"""

## TOPIC & ANGLE
Topic: ${refinedIntent.topic}
Angle: ${refinedIntent.angle || 'personal story or insight'}
Strategy: ${strategy.reasonings?.[0] || 'Continue your content narrative'}

## HUMAN WRITING PATTERNS (USE THESE)
- Contractions: ${usesContractions ? 'YES' : 'NO'}
- Short sentences: ${usesShortSentences ? 'YES' : 'NO'}
- Sentence fragments: ${usesFragments ? 'YES (e.g. "Exactly.")' : 'NO'}
- Conversational starts: ${conversationalStart ? 'YES (e.g. "So...", "Here\'s the thing")' : 'NO'}
- Questions: ${usesQuestions ? 'YES' : 'NO'}
- Paragraphs: ${avgParagraphLength} per post

## ABSOLUTE RULES FOR HUMAN AUTHENTICITY

❌ NEVER use:
- Em dashes (—) → use regular dashes (-) or periods
- Semicolons → use periods or commas
- Words like: "delve", "unlock", "leverage", "harness", "revolutionize", "game-changer", "dive deep"
- Phrases like: "in today's world", "the power of", "key takeaways", "let that sink in"
- Corporate speak: "synergy", "circle back", "touch base", "bandwidth"
- AI giveaways: "I hope this helps", "it's important to note"

✅ DO use:
- Real contractions: I'm, you're, it's, that's, won't, can't
- Simple words: use, help, make, get, start, try (not: utilize, facilitate, implement)
- Conversational flow: "So here's what I learned", "Honestly?", "Here's the thing"
- Short sentences. Really short. One idea per sentence.
- Occasional fragments. For emphasis.
- Real human mistakes: slightly awkward phrasing, not perfectly polished
- Natural rhythm: vary sentence length, not all the same cadence

## WRITE THE POST

Write ONE post (not variations) that:
1. Starts like their actual posts
2. Sounds like casual human speech
3. Has their personality and quirks
4. Feels authentic, not polished
5. Could pass as written by them, not AI

Just the post. No meta-commentary. No "here's your post" - just the post itself.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a writing mimic specializing in human authenticity. Your posts should be indistinguishable from real human writing - with natural flow, real vocabulary, and zero AI tells.

Write like a human texting their thoughts, not like AI generating content.`,
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.9, // High for natural variation
    max_tokens: 500,
  });

  const generatedPost = response.choices[0].message.content || '';

  // Post-process: Remove AI artifacts
  let cleaned = generatedPost
    .replace(/—/g, '-') // Replace em dashes
    .replace(/;/g, '.') // Replace semicolons
    .replace(/\*\*/g, '') // Remove bold markdown
    .trim();

  console.log('[hyper-human] Generated post length:', cleaned.length);

  return cleaned;
}

