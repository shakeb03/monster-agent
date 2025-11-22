# 16-CONVERSATIONAL-STRATEGIST.md - Human-Like Content Planning

## Problem
User says "draft my next post" → Agent generates random generic content instead of:
1. Understanding what user wants to achieve
2. Analyzing their content journey
3. Suggesting strategic next steps
4. Having a conversation to refine direction
5. Then generating hyper-authentic content

---

## Step 1: Create Content Strategy Analyzer

Create `lib/strategy/content-analyzer.ts`:

```typescript
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

interface ContentStrategy {
  recentTopics: string[];
  topicFrequency: Record<string, number>;
  lastPostDate: string | null;
  contentGaps: string[];
  suggestedNextTopics: string[];
  reasonings: string[];
  userGoals: string[];
}

export async function analyzeContentStrategy(userId: string): Promise<ContentStrategy> {
  const supabase = await createClient();

  // Get user's recent posts (last 10)
  const { data: recentPosts } = await supabase
    .from('linkedin_posts')
    .select('post_text, posted_at, post_analysis(topics)')
    .eq('user_id', userId)
    .order('posted_at', { ascending: false })
    .limit(10);

  // Get user goals
  const { data: user } = await supabase
    .from('users')
    .select('goals')
    .eq('id', userId)
    .single();

  // Get voice analysis for common topics
  const { data: voice } = await supabase
    .from('voice_analysis')
    .select('common_topics')
    .eq('user_id', userId)
    .single();

  if (!recentPosts || recentPosts.length === 0) {
    return {
      recentTopics: [],
      topicFrequency: {},
      lastPostDate: null,
      contentGaps: voice?.common_topics || [],
      suggestedNextTopics: voice?.common_topics.slice(0, 3) || [],
      reasonings: ['No recent posts to analyze. Suggested topics from your expertise.'],
      userGoals: user?.goals || [],
    };
  }

  // Analyze topic distribution
  const topicCounts: Record<string, number> = {};
  const allTopics: string[] = [];

  recentPosts.forEach(post => {
    const topics = post.post_analysis?.topics || [];
    topics.forEach((topic: string) => {
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      allTopics.push(topic);
    });
  });

  // Find content gaps
  const userExpertise = voice?.common_topics || [];
  const recentTopicsSet = new Set(allTopics);
  const contentGaps = userExpertise.filter(topic => !recentTopicsSet.has(topic));

  // Use GPT to suggest strategic next topics
  const strategyPrompt = `Analyze this LinkedIn content strategy:

RECENT POSTS (last 10):
${recentPosts.map((p, i) => `${i + 1}. Topics: ${p.post_analysis?.topics?.join(', ') || 'none'}`).join('\n')}

TOPIC FREQUENCY:
${Object.entries(topicCounts).map(([topic, count]) => `- ${topic}: ${count} posts`).join('\n')}

USER'S EXPERTISE:
${userExpertise.join(', ')}

USER'S GOALS:
${user?.goals?.join(', ') || 'Not specified'}

CONTENT GAPS (topics user knows but hasn't posted about):
${contentGaps.join(', ') || 'None'}

Suggest 3 strategic next post topics that:
1. Avoid repetition (don't repeat recent topics)
2. Fill content gaps if relevant
3. Align with user goals
4. Create a cohesive content narrative

Return JSON:
{
  "suggestions": [
    {
      "topic": "specific topic",
      "reasoning": "why this makes strategic sense now",
      "aligns_with_goal": "which goal it supports"
    }
  ]
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a LinkedIn content strategist. Suggest topics that create a cohesive narrative, not random posts.',
      },
      { role: 'user', content: strategyPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const result = JSON.parse(response.choices[0].message.content || '{"suggestions":[]}');

  return {
    recentTopics: [...new Set(allTopics)],
    topicFrequency: topicCounts,
    lastPostDate: recentPosts[0]?.posted_at || null,
    contentGaps,
    suggestedNextTopics: result.suggestions.map((s: any) => s.topic),
    reasonings: result.suggestions.map((s: any) => s.reasoning),
    userGoals: user?.goals || [],
  };
}
```

---

## Step 2: Create Conversational Agent Mode

Create `lib/agent/conversational-mode.ts`:

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

interface ConversationState {
  stage: 'understanding' | 'refining' | 'generating';
  collectedInfo: {
    topic?: string;
    angle?: string;
    goalAlignment?: string;
    tone?: string;
    urgency?: string;
  };
}

export async function handleContentRequest(
  userMessage: string,
  strategy: any,
  conversationHistory: any[]
): Promise<{ response: string; shouldGenerate: boolean; refinedIntent: any }> {
  
  // Check if we have enough information to generate
  const hasEnoughInfo = checkIfReadyToGenerate(conversationHistory);

  if (hasEnoughInfo) {
    return {
      response: '', // Will generate content
      shouldGenerate: true,
      refinedIntent: extractIntentFromConversation(conversationHistory),
    };
  }

  // Build conversational prompt
  const conversationPrompt = `You are a LinkedIn content strategist having a conversation with a user about their next post.

USER'S CONTENT STRATEGY:
- Recent topics: ${strategy.recentTopics.slice(0, 5).join(', ')}
- Content gaps: ${strategy.contentGaps.join(', ')}
- Goals: ${strategy.userGoals.join(', ')}

STRATEGIC SUGGESTIONS:
${strategy.reasonings.map((r: string, i: number) => `${i + 1}. ${strategy.suggestedNextTopics[i]}: ${r}`).join('\n')}

CONVERSATION SO FAR:
${conversationHistory.map((m: any) => `${m.role}: ${m.content}`).join('\n')}

USER'S LATEST MESSAGE:
${userMessage}

YOUR JOB:
1. If user said something vague like "draft my next post", ask what they want to talk about
2. Suggest strategic topics based on their content gaps and goals
3. Ask clarifying questions to understand their angle
4. Once you understand (topic + angle + goal), confirm and say you'll generate

BE CONVERSATIONAL. Don't be robotic. Ask one question at a time. Suggest options.

Examples:
- "I see you haven't posted about [gap topic] lately. Want to write about that? Or something else on your mind?"
- "Cool! Leadership it is. What angle - a personal story, a contrarian take, or practical advice?"
- "Got it. Since your goal is [goal], we could tie this to [specific angle]. Sound good?"

Response (natural, conversational, one question at a time):`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are a content strategist. Be conversational, helpful, and strategic. Guide users to create content that fits their narrative.',
      },
      { role: 'user', content: conversationPrompt },
    ],
    temperature: 0.8,
    max_tokens: 300,
  });

  return {
    response: response.choices[0].message.content || '',
    shouldGenerate: false,
    refinedIntent: null,
  };
}

function checkIfReadyToGenerate(history: any[]): boolean {
  // Check if conversation has covered: topic, angle, and confirmation
  const conversationText = history.map(m => m.content).join(' ').toLowerCase();
  
  const hasTopic = history.some(m => 
    m.role === 'user' && 
    m.content.length > 10 && 
    !m.content.toLowerCase().includes('draft')
  );

  const hasConfirmation = conversationText.includes('yes') || 
                         conversationText.includes('sounds good') ||
                         conversationText.includes('go ahead') ||
                         conversationText.includes('perfect');

  // Need at least 3 turns (ask topic, user responds, ask angle, user responds, confirm)
  return history.length >= 5 && hasTopic && hasConfirmation;
}

function extractIntentFromConversation(history: any[]): any {
  // Extract topic, angle, tone from conversation
  const userMessages = history.filter(m => m.role === 'user');
  
  // Simple extraction (can be made more sophisticated)
  const topic = userMessages
    .map(m => m.content)
    .find(c => !c.toLowerCase().includes('draft') && c.length > 10);

  return {
    topic: topic || 'general',
    angle: 'personal', // Can be extracted more intelligently
    confirmed: true,
  };
}
```

---

## Step 3: Create Hyper-Human Content Generator

Create `lib/agent/hyper-human-generator.ts`:

```typescript
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function generateHyperHumanContent(
  userId: string,
  refinedIntent: any,
  strategy: any
): Promise<string> {
  const supabase = await createClient();

  // Get user's actual posts for voice matching
  const { data: topPosts } = await supabase
    .from('linkedin_posts')
    .select('post_text, engagement_rate')
    .eq('user_id', userId)
    .order('engagement_rate', { ascending: false })
    .limit(3);

  if (!topPosts || topPosts.length === 0) {
    throw new Error('No posts to learn from');
  }

  // Analyze human writing patterns
  const post1 = topPosts[0].post_text;
  const post2 = topPosts[1]?.post_text || post1;
  
  // Extract human patterns
  const usesContractions = /\b(I'm|you're|we're|that's|it's|don't|can't|won't)\b/.test(post1);
  const usesShortSentences = post1.split(/[.!?]/).filter(s => s.trim().length > 0).some(s => s.length < 50);
  const usesFragments = /^\w+\.$|^\w+ \w+\.$/.test(post1); // One or two word sentences
  const conversationalStart = /^(So|Well|Here's|Look|Listen|Honestly)/i.test(post1);
  const usesQuestions = /\?/.test(post1);
  const avgParagraphLength = post1.split('\n\n').filter(p => p.trim()).length;

  const prompt = `Write a LinkedIn post that sounds EXACTLY like a real human wrote it, not AI.

## USER'S ACTUAL POSTS (STUDY THESE)

Post 1 (${topPosts[0].engagement_rate}% engagement):
"""
${post1}
"""

Post 2 (${topPosts[1]?.engagement_rate}% engagement):
"""
${post2}
"""

## TOPIC & ANGLE
Topic: ${refinedIntent.topic}
Angle: ${refinedIntent.angle || 'personal story or insight'}
Strategy: ${strategy.reasonings[0] || 'Continue your content narrative'}

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

  return cleaned;
}
```

---

## Step 4: Update Agent to Use Conversational Mode

Update `lib/agent/orchestrator.ts`:

```typescript
import { analyzeContentStrategy } from '@/lib/strategy/content-analyzer';
import { handleContentRequest } from '@/lib/agent/conversational-mode';
import { generateHyperHumanContent } from '@/lib/agent/hyper-human-generator';

// Add new tool for content planning
const AGENT_TOOLS = [
  // ... existing tools ...
  {
    type: 'function',
    function: {
      name: 'plan_next_post',
      description: 'Analyze user\'s content strategy and start conversation about their next post. Use this when user asks to "write post", "draft post", or similar vague requests.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string' },
        },
        required: ['user_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_human_post',
      description: 'Generate hyper-authentic post after conversation has refined the intent. Only use after user has confirmed topic and angle.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string' },
          refined_intent: {
            type: 'object',
            description: 'Topic and angle extracted from conversation',
          },
        },
        required: ['user_id', 'refined_intent'],
      },
    },
  },
];

// Tool implementations:

async function planNextPost(userId: string, conversationHistory: any[]) {
  // Analyze content strategy
  const strategy = await analyzeContentStrategy(userId);

  // Handle conversationally
  const lastUserMessage = conversationHistory
    .filter(m => m.role === 'user')
    .pop()?.content || 'draft my next post';

  const result = await handleContentRequest(
    lastUserMessage,
    strategy,
    conversationHistory
  );

  return {
    strategy,
    conversationalResponse: result.response,
    shouldGenerate: result.shouldGenerate,
    refinedIntent: result.refinedIntent,
  };
}

async function generateHumanPostTool(userId: string, refinedIntent: any) {
  const strategy = await analyzeContentStrategy(userId);
  const post = await generateHyperHumanContent(userId, refinedIntent, strategy);
  
  return {
    post,
    note: 'This post was tailored to fit your content narrative and written in your authentic voice.',
  };
}
```

---

## Step 5: Update System Prompt for Conversational Flow

```typescript
const systemPrompt = `You are a LinkedIn content strategist AI. You help users create strategic, authentic content.

## YOUR APPROACH

When user says "draft my next post" or similar:

1. DON'T immediately generate - this creates random, disconnected content
2. DO start a conversation:
   - Call plan_next_post tool
   - Ask what they want to talk about
   - Suggest strategic topics based on their content gaps
   - Ask about angle (story, advice, observation, etc.)
   - Confirm before generating

3. During conversation:
   - Be casual and helpful
   - Suggest strategic directions
   - Explain WHY certain topics make sense now
   - Ask one question at a time
   - Guide them to coherent content narrative

4. When ready:
   - User confirms topic and angle
   - Call generate_human_post with refined intent
   - Return hyper-authentic content

## EXAMPLE CONVERSATION

User: "draft my next post"

You: [call plan_next_post]
"I see you've posted about productivity and remote work lately. Want to continue that thread, or explore something new? You haven't talked about [gap topic] in a while - that could be interesting?"

User: "leadership sounds good"

You: "Cool! Leadership it is. What angle are you thinking - a personal story about a leadership lesson you learned, practical advice, or maybe a contrarian take?"

User: "personal story"

You: "Perfect. A leadership story. Since your goal is building thought leadership, a vulnerable story about a mistake could resonate well. Sound good?"

User: "yes go ahead"

You: [call generate_human_post with topic="leadership", angle="personal story"]
[Returns authentic post]

## KEY PRINCIPLES

- Strategic: Suggest topics that fit their narrative
- Conversational: Natural, helpful tone
- Collaborative: Guide but let them decide
- Authentic: Final content sounds human, not AI`;
```

---

## Step 6: Test the Flow

Test conversation:

```
User: "draft me my next post"

Agent:
[Calls plan_next_post]
"Hey! I looked at your recent posts - you've been on a roll with productivity and remote work. 

But I noticed you haven't talked about system design in a couple weeks, which is one of your strong topics. Want to circle back to that? 

Or if you want to keep the momentum going, we could do another productivity post with a different angle?"

User: "system design sounds good"

Agent:
"Nice! System design it is.

What angle are you feeling - 
• A war story from a project that went sideways?
• Practical advice for beginners?
• Or a hot take on something people get wrong?

(Your war stories usually get great engagement btw)"

User: "war story"

Agent:
"Perfect. A system design war story. 

Since your goal is building thought leadership, showing vulnerability about mistakes tends to hit hard. 

Want me to draft something where you share what went wrong and what you learned?"

User: "yes"

Agent:
[Calls generate_human_post]

Here's your post:

---

So I spent 3 months building a system that fell apart in production on day one.

The problem? I optimized for scale we didn't have yet.

Over-engineered microservices. Kafka clusters for 100 users. The whole nine yards.

Meanwhile, a simple monolith would've worked for 2 years.

I learned this the hard way: build for the problem you have today, not the one you might have tomorrow.

Start simple. Add complexity when you actually need it.

What's a mistake that taught you more than any success?

---

**Why this works:**
- Starts with vulnerability (your top pattern)
- Conversational tone
- Short sentences
- Ends with engagement question
- Fits your "lessons from mistakes" narrative

Sound good or want me to adjust anything?
```

---

## Expected Behavior

### Vague Request → Conversation
```
User: "write me a post"
Agent: "About what? I see you haven't covered [gap] lately..."
```

### After Understanding → Strategic Generation
```
User: "yes sounds good"
Agent: [Generates hyper-authentic content that fits narrative]
```

### Human Voice
```
✅ "So I spent 3 months..." (conversational start)
✅ Short sentences
✅ Real contractions
✅ No em dashes or semicolons
✅ Sounds like a human texting thoughts
```

---

## Implementation Order

1. Create content-analyzer.ts (strategy)
2. Create conversational-mode.ts (dialogue)
3. Create hyper-human-generator.ts (authentic content)
4. Update orchestrator with new tools
5. Update system prompt
6. Test full conversation flow

This gives you a TRUE content strategist that guides users to create coherent, authentic content.