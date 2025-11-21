# 12-AGENTIC-ARCHITECTURE.md - Intelligent Agent System

## Problem Statement

Current flow:
```
User: "write me a post"
→ OpenAI API (generic chat)
→ "What topic do you want?"
```

Desired flow:
```
User: "write me a post"
→ Agent analyzes request
→ Fetches user's voice profile, top patterns, goals
→ Generates 3 post variations using proven formulas
→ Returns ready-to-post content
```

---

## Step 1: Create Agent Orchestrator

Create `lib/agent/orchestrator.ts`:

```typescript
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

interface AgentAction {
  tool: string;
  parameters: Record<string, any>;
  reasoning: string;
}

interface AgentResponse {
  finalAnswer: string;
  toolsUsed: string[];
  contextGathered: any;
}

const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_user_profile',
      description: 'Get user LinkedIn profile, voice analysis, and goals. Use this when you need to understand the user\'s style, topics, or objectives.',
      parameters: {
        type: 'object',
        properties: {
          user_id: {
            type: 'string',
            description: 'The user ID',
          },
        },
        required: ['user_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_viral_patterns',
      description: 'Get proven viral patterns for content creation. Use this when generating posts to ensure high engagement.',
      parameters: {
        type: 'object',
        properties: {
          user_id: {
            type: 'string',
            description: 'The user ID',
          },
          pattern_types: {
            type: 'array',
            items: { type: 'string' },
            description: 'Types of patterns needed: hook, format, cta, topic, emotion',
          },
          limit: {
            type: 'number',
            description: 'Number of patterns to return (default: 5)',
          },
        },
        required: ['user_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_top_performing_posts',
      description: 'Get user\'s top-performing posts for reference. Use this when you need examples of what works well.',
      parameters: {
        type: 'object',
        properties: {
          user_id: {
            type: 'string',
            description: 'The user ID',
          },
          topic: {
            type: 'string',
            description: 'Optional: filter by topic',
          },
          limit: {
            type: 'number',
            description: 'Number of posts to return (default: 3)',
          },
        },
        required: ['user_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_viral_content',
      description: 'Generate LinkedIn post content using user\'s proven patterns and voice. Always use this after gathering context.',
      parameters: {
        type: 'object',
        properties: {
          user_id: {
            type: 'string',
            description: 'The user ID',
          },
          topic: {
            type: 'string',
            description: 'Topic or theme for the post',
          },
          tone: {
            type: 'string',
            description: 'Desired tone (optional, defaults to user\'s style)',
          },
          context: {
            type: 'object',
            description: 'Context gathered from other tools',
          },
        },
        required: ['user_id', 'topic', 'context'],
      },
    },
  },
];

export async function runAgent(
  userId: string,
  userMessage: string
): Promise<AgentResponse> {
  const supabase = await createClient();

  // Get user from DB
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (!user) {
    throw new Error('User not found');
  }

  const messages: any[] = [
    {
      role: 'system',
      content: `You are an intelligent LinkedIn content agent. When a user asks you to create content:

1. ANALYZE the request to understand what they want
2. GATHER necessary context using tools (profile, patterns, examples)
3. GENERATE content using gathered context
4. RESPOND with ready-to-use content

The user has already completed onboarding - you have access to their:
- Voice analysis and writing style
- Proven viral patterns
- Top-performing posts
- Goals and objectives

NEVER ask the user for information you can fetch yourself. Be proactive and intelligent.

Example:
User: "write me a post"
You: [Use get_user_profile → get_viral_patterns → generate_viral_content] → Return 3 post variations

Example 2:
User: "write about leadership"
You: [Use get_user_profile → get_top_performing_posts with topic="leadership" → get_viral_patterns → generate_viral_content] → Return tailored leadership post

Always gather context BEFORE generating. Never respond with questions - respond with content.`,
    },
    {
      role: 'user',
      content: userMessage,
    },
  ];

  let toolsUsed: string[] = [];
  let contextGathered: any = {};
  let iterations = 0;
  const MAX_ITERATIONS = 5;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      tools: AGENT_TOOLS,
      tool_choice: 'auto',
      temperature: 0.7,
    });

    const message = response.choices[0].message;
    messages.push(message);

    // If no tool calls, we have final answer
    if (!message.tool_calls || message.tool_calls.length === 0) {
      return {
        finalAnswer: message.content || '',
        toolsUsed,
        contextGathered,
      };
    }

    // Execute tool calls
    for (const toolCall of message.tool_calls) {
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments);

      toolsUsed.push(toolName);

      let toolResult: any;

      switch (toolName) {
        case 'get_user_profile':
          toolResult = await getUserProfile(toolArgs.user_id);
          contextGathered.profile = toolResult;
          break;

        case 'get_viral_patterns':
          toolResult = await getViralPatterns(
            toolArgs.user_id,
            toolArgs.pattern_types,
            toolArgs.limit
          );
          contextGathered.patterns = toolResult;
          break;

        case 'get_top_performing_posts':
          toolResult = await getTopPerformingPosts(
            toolArgs.user_id,
            toolArgs.topic,
            toolArgs.limit
          );
          contextGathered.topPosts = toolResult;
          break;

        case 'generate_viral_content':
          toolResult = await generateViralContent(
            toolArgs.user_id,
            toolArgs.topic,
            toolArgs.tone,
            toolArgs.context
          );
          break;

        default:
          toolResult = { error: 'Unknown tool' };
      }

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult),
      });
    }
  }

  // Fallback if max iterations reached
  return {
    finalAnswer: 'I need more iterations to complete this task. Please try again.',
    toolsUsed,
    contextGathered,
  };
}

// Tool implementations

async function getUserProfile(userId: string) {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('linkedin_profiles')
    .select('full_name, headline, about')
    .eq('user_id', userId)
    .single();

  const { data: voiceAnalysis } = await supabase
    .from('voice_analysis')
    .select('overall_tone, writing_style, common_topics, strengths, analysis_summary')
    .eq('user_id', userId)
    .single();

  const { data: user } = await supabase
    .from('users')
    .select('goals')
    .eq('id', userId)
    .single();

  return {
    profile: profile || {},
    voice: voiceAnalysis || {},
    goals: user?.goals || [],
  };
}

async function getViralPatterns(
  userId: string,
  patternTypes?: string[],
  limit = 5
) {
  const supabase = await createClient();

  let query = supabase
    .from('viral_patterns')
    .select('pattern_type, pattern_description, success_rate')
    .eq('user_id', userId)
    .order('success_rate', { ascending: false });

  if (patternTypes && patternTypes.length > 0) {
    query = query.in('pattern_type', patternTypes);
  }

  const { data: patterns } = await query.limit(limit);

  return patterns || [];
}

async function getTopPerformingPosts(
  userId: string,
  topic?: string,
  limit = 3
) {
  const supabase = await createClient();

  let query = supabase
    .from('linkedin_posts')
    .select('post_text, engagement_rate, post_analysis(tone, what_worked, hook_analysis)')
    .eq('user_id', userId)
    .gte('engagement_rate', 5)
    .order('engagement_rate', { ascending: false });

  const { data: posts } = await query.limit(limit);

  return (posts || []).map(p => ({
    text: p.post_text,
    engagement: p.engagement_rate,
    hook: p.post_text.split('\n')[0],
    whatWorked: p.post_analysis?.what_worked,
  }));
}

async function generateViralContent(
  userId: string,
  topic: string,
  tone: string | undefined,
  context: any
) {
  const { profile, voice, patterns, topPosts } = context;

  const prompt = `Create 3 LinkedIn post variations for this user.

USER PROFILE:
${JSON.stringify(profile, null, 2)}

VOICE & STYLE:
${JSON.stringify(voice, null, 2)}

PROVEN VIRAL PATTERNS:
${patterns?.map((p: any) => `- [${p.pattern_type}] ${p.pattern_description} (${p.success_rate}% success)`).join('\n')}

TOP PERFORMING POSTS:
${topPosts?.map((p: any, i: number) => `
Post ${i + 1} (${p.engagement}% engagement):
Hook: "${p.hook}"
What worked: ${p.whatWorked}
`).join('\n')}

TASK: Create post about "${topic}"${tone ? ` with ${tone} tone` : ''}

REQUIREMENTS:
1. Use at least 2 proven viral patterns
2. Match the user's voice exactly
3. Create 3 variations (different hooks)
4. Each variation should be ready to post
5. Include engagement prediction (1-10) for each

FORMAT:
### Variation 1: [Hook Style]
[Full post content]

**Patterns used:** [list]
**Predicted engagement:** X/10
**Why it works:** [brief explanation]

[Repeat for variations 2 and 3]

### Recommendation:
[Which variation to use and why]`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are an expert at creating viral LinkedIn content using proven patterns.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.8,
    max_tokens: 2000,
  });

  return response.choices[0].message.content || '';
}
```

---

## Step 2: Update Chat API to Use Agent

Replace `app/api/chat/route.ts` with agent-based version:

```typescript
import { auth } from '@clerk/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runAgent } from '@/lib/agent/orchestrator';

export async function POST(req: NextRequest) {
  try {
    const { userId } = auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { message, chatId } = await req.json();

    if (!message || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_user_id', userId)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Create chat if needed
    let currentChatId = chatId;
    if (!currentChatId) {
      const { data: newChat } = await supabase
        .from('chats')
        .insert({
          user_id: user.id,
          title: message.substring(0, 50),
        })
        .select()
        .single();

      currentChatId = newChat?.id;
    }

    // Save user message
    await supabase.from('messages').insert({
      chat_id: currentChatId,
      user_id: user.id,
      role: 'user',
      content: message,
      token_count: Math.ceil(message.length / 4),
    });

    // Run agent (this handles all tool calls automatically)
    const agentResponse = await runAgent(user.id, message);

    // Save assistant response
    await supabase.from('messages').insert({
      chat_id: currentChatId,
      user_id: user.id,
      role: 'assistant',
      content: agentResponse.finalAnswer,
      token_count: Math.ceil(agentResponse.finalAnswer.length / 4),
    });

    // Update chat
    await supabase
      .from('chats')
      .update({
        last_message_at: new Date().toISOString(),
        message_count: supabase.rpc('increment', { x: 2 }),
      })
      .eq('id', currentChatId);

    return NextResponse.json({
      success: true,
      response: agentResponse.finalAnswer,
      toolsUsed: agentResponse.toolsUsed,
      chatId: currentChatId,
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

---

## Step 3: Add Intent Classifier for Smart Routing

Create `lib/agent/intent-classifier.ts`:

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export interface UserIntent {
  type: 'generate_post' | 'improve_post' | 'analyze' | 'question' | 'chat';
  topic?: string;
  specificRequest?: string;
  needsContext: boolean;
}

export async function classifyIntent(message: string): Promise<UserIntent> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `Classify user intent for LinkedIn content agent.

Types:
- generate_post: User wants to create new content
- improve_post: User wants to improve existing content
- analyze: User wants feedback or analysis
- question: User has a question about their profile/performance
- chat: General conversation

Return JSON: { type, topic, specificRequest, needsContext }`,
      },
      { role: 'user', content: message },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  return JSON.parse(response.choices[0].message.content || '{}');
}
```

---

## Step 4: Create Specialized Sub-Agents

Create `lib/agent/sub-agents/post-generator.ts`:

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function generatePost(context: {
  userProfile: any;
  voiceAnalysis: any;
  viralPatterns: any[];
  topPosts: any[];
  topic: string;
  tone?: string;
}) {
  const { userProfile, voiceAnalysis, viralPatterns, topPosts, topic, tone } = context;

  const prompt = `You are a LinkedIn content expert. Create 3 high-engagement post variations.

## USER CONTEXT
Name: ${userProfile.full_name}
Headline: ${userProfile.headline}
Voice: ${voiceAnalysis.overall_tone}
Style: ${voiceAnalysis.writing_style}

## PROVEN PATTERNS (USE THESE)
${viralPatterns.map((p, i) => `${i + 1}. [${p.pattern_type}] ${p.pattern_description}`).join('\n')}

## TOP PERFORMING EXAMPLES
${topPosts.map((p, i) => `
Example ${i + 1} (${p.engagement}% engagement):
"${p.hook}"
What worked: ${p.whatWorked}
`).join('\n')}

## REQUEST
Topic: ${topic}
${tone ? `Tone: ${tone}` : 'Tone: Match user\'s natural style'}

## OUTPUT FORMAT
Create 3 variations with different hooks. For each:
1. Full post (ready to copy-paste)
2. Patterns used
3. Engagement prediction (1-10)
4. 1-line reasoning

End with recommendation of which to use.

GO:`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.8,
    max_tokens: 2000,
  });

  return response.choices[0].message.content || '';
}
```

---

## Step 5: Add Streaming Support (Optional)

If you want streaming responses, update the agent:

```typescript
// In orchestrator.ts, add streaming version:

export async function runAgentStreaming(
  userId: string,
  userMessage: string,
  onChunk: (text: string) => void
): Promise<void> {
  // Run agent normally to gather context
  const contextMessages = await gatherContext(userId, userMessage);

  // Stream final generation
  const stream = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: contextMessages,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    if (content) {
      onChunk(content);
    }
  }
}
```

---

## Step 6: Testing the Agent

Test cases:

```typescript
// Test 1: Simple request
User: "write me a post"
Expected: Agent fetches profile → patterns → generates 3 variations

// Test 2: Specific topic
User: "write about leadership in remote teams"
Expected: Agent fetches profile → relevant patterns → top leadership posts → generates

// Test 3: Improvement
User: "improve this: [paste post]"
Expected: Agent analyzes → suggests improvements using patterns

// Test 4: Question
User: "what topics work best for me?"
Expected: Agent analyzes top posts → returns insights
```

---

## Step 7: Add Agent Monitoring

Create `lib/agent/monitor.ts`:

```typescript
export async function logAgentAction(
  userId: string,
  action: {
    request: string;
    toolsUsed: string[];
    contextTokens: number;
    responseTime: number;
    success: boolean;
  }
) {
  const supabase = await createClient();

  await supabase.from('agent_logs').insert({
    user_id: userId,
    request: action.request,
    tools_used: action.toolsUsed,
    context_tokens: action.contextTokens,
    response_time_ms: action.responseTime,
    success: action.success,
  });
}
```

Add table:

```sql
CREATE TABLE agent_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    request TEXT NOT NULL,
    tools_used TEXT[],
    context_tokens INTEGER,
    response_time_ms INTEGER,
    success BOOLEAN,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_logs_user_id ON agent_logs(user_id, created_at DESC);
```

---

## Expected Behavior

### Before (Generic LLM):
```
User: "write me a post"
Bot: "Sure! What topic would you like to write about?"
User: "leadership"
Bot: "Great! What's your tone?"
[frustrating back-and-forth]
```

### After (Intelligent Agent):
```
User: "write me a post"
Agent: [thinks: need profile + patterns + examples]
       [fetches all necessary context]
       [generates using proven formulas]
Bot: "Here are 3 post variations about [your top topic]:

### Variation 1: Contrarian Take
[Full ready-to-post content using your proven hook formula]

**Patterns used:** Contrarian hook, 3-line breaks, question CTA
**Predicted engagement:** 8/10
**Why it works:** Uses your proven 'What if...' hook that gets 12% avg engagement

[Variations 2 and 3...]

**Recommendation:** Use Variation 1 - it matches your highest-performing pattern."
```

This is true agentic behavior - proactive, intelligent, context-aware.