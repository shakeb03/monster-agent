# 13-FIX-AGENT-MEMORY.md - Fix Agent Memory Issue

## Problem
Agent generates 3 variations, then user says "write the 3rd one" and agent has no idea what it said before.

---

## Step 1: Update Agent Orchestrator to Use Conversation History

Replace `lib/agent/orchestrator.ts` with memory-aware version:

```typescript
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

interface AgentResponse {
  finalAnswer: string;
  toolsUsed: string[];
  contextGathered: any;
}

const AGENT_TOOLS = [
  // ... (same tools as before)
];

export async function runAgent(
  userId: string,
  userMessage: string,
  chatId: string // Now required!
): Promise<AgentResponse> {
  const supabase = await createClient();

  // Get user
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (!user) {
    throw new Error('User not found');
  }

  // ✅ CRITICAL: Load conversation history
  const { data: previousMessages } = await supabase
    .from('messages')
    .select('role, content')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
    .limit(20); // Last 20 messages

  // Build messages array with history
  const messages: any[] = [
    {
      role: 'system',
      content: `You are an intelligent LinkedIn content agent with access to user data and conversation history.

CRITICAL RULES:
1. When user refers to "variation 3", "the second one", "that post", etc., look at YOUR PREVIOUS RESPONSES in the conversation history
2. Maintain continuity - remember what you generated before
3. If user asks to "write variation 3", output EXACTLY what you showed as variation 3 in your last response
4. Never generate new content when user is referencing something you already created

You have access to tools to fetch user data, but ALWAYS check conversation history first for context.`,
    },
    // ✅ Add conversation history
    ...(previousMessages || []).map(msg => ({
      role: msg.role,
      content: msg.content,
    })),
    // Add current message
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

      // ✅ Add tool result to conversation
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult),
      });
    }
  }

  return {
    finalAnswer: 'Max iterations reached. Please try again.',
    toolsUsed,
    contextGathered,
  };
}

// ... rest of tool implementations stay the same
```

---

## Step 2: Update Chat API to Pass Chat ID

Update `app/api/chat/route.ts`:

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

    // Save user message BEFORE running agent
    await supabase.from('messages').insert({
      chat_id: currentChatId,
      user_id: user.id,
      role: 'user',
      content: message,
      token_count: Math.ceil(message.length / 4),
    });

    // ✅ Run agent WITH chat ID for history
    const agentResponse = await runAgent(user.id, message, currentChatId);

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

## Step 3: Add Reference Detection Tool

Add a new tool to help agent understand references:

```typescript
// Add to AGENT_TOOLS array in orchestrator.ts

{
  type: 'function',
  function: {
    name: 'get_previous_response',
    description: 'Get your previous response from conversation history. Use this when user refers to "variation 3", "the second one", "that post", etc.',
    parameters: {
      type: 'object',
      properties: {
        chat_id: {
          type: 'string',
          description: 'The chat ID',
        },
        query: {
          type: 'string',
          description: 'What to look for (e.g., "variation 3", "second post")',
        },
      },
      required: ['chat_id', 'query'],
    },
  },
}

// Implementation:
async function getPreviousResponse(chatId: string, query: string) {
  const supabase = await createClient();

  const { data: lastAssistantMessage } = await supabase
    .from('messages')
    .select('content')
    .eq('chat_id', chatId)
    .eq('role', 'assistant')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return {
    previousResponse: lastAssistantMessage?.content || 'No previous response found',
    query,
  };
}
```

---

## Step 4: Improve System Prompt for References

Update the system prompt in orchestrator:

```typescript
const systemPrompt = `You are an intelligent LinkedIn content agent with conversation memory.

## HANDLING USER REFERENCES
When user says:
- "write variation 3" → Extract variation 3 from YOUR last response
- "the second one" → Extract the second item from YOUR last response
- "that post" → Reference the most recent post you generated
- "improve it" → Reference the most recent content

## PROCESS
1. Check if user is referencing previous content
2. If yes: Look at conversation history (it's already included in messages)
3. Extract the exact content they're referencing
4. Respond with that specific content or modification

## TOOLS
Use tools to fetch NEW data (user profile, patterns, etc.)
Do NOT use tools for content you already generated

## CRITICAL
- You have full conversation history in the messages array
- When user refers to "variation 3", parse YOUR previous response to find it
- Never generate new content when user wants something you already created`;
```

---

## Step 5: Add Structured Output for Variations

To make references easier, structure your output with clear markers:

```typescript
// In generateViralContent function:

const prompt = `Create 3 LinkedIn post variations.

[... context ...]

## OUTPUT FORMAT
Return as JSON:
{
  "variations": [
    {
      "id": 1,
      "label": "Variation 1: [Hook Style]",
      "post": "[Full post content]",
      "patterns": ["pattern1", "pattern2"],
      "engagement_prediction": 8,
      "reasoning": "Why it works"
    },
    // ... 2 more
  ],
  "recommendation": {
    "variation_id": 1,
    "reason": "Why this one"
  }
}`;

// Then in your response formatting:
const variations = JSON.parse(toolResult);

const formattedResponse = variations.variations.map((v: any) => `
### ${v.label}
${v.post}

**Patterns used:** ${v.patterns.join(', ')}
**Predicted engagement:** ${v.engagement_prediction}/10
**Why it works:** ${v.reasoning}
`).join('\n\n');

// Store structured data in metadata for easy retrieval
await supabase.from('messages').insert({
  chat_id: currentChatId,
  user_id: user.id,
  role: 'assistant',
  content: formattedResponse,
  metadata: { variations }, // ✅ Store structured data
});
```

---

## Step 6: Create Reference Parser Utility

Create `lib/agent/reference-parser.ts`:

```typescript
export function parseVariationReference(
  userMessage: string,
  previousResponse: string
): string | null {
  const lowerMessage = userMessage.toLowerCase();

  // Check for variation references
  const variationMatch = lowerMessage.match(/variation\s+(\d+|one|two|three|first|second|third)/i);
  
  if (!variationMatch) {
    return null;
  }

  const variationNumber = parseVariationNumber(variationMatch[1]);

  // Extract variation from previous response
  const variations = previousResponse.split('### Variation');
  
  if (variationNumber && variationNumber <= variations.length - 1) {
    return variations[variationNumber].split('**Patterns used:**')[0].trim();
  }

  return null;
}

function parseVariationNumber(str: string): number | null {
  const map: Record<string, number> = {
    '1': 1, 'one': 1, 'first': 1,
    '2': 2, 'two': 2, 'second': 2,
    '3': 3, 'three': 3, 'third': 3,
  };
  
  return map[str.toLowerCase()] || null;
}
```

---

## Expected Flow After Fix

```
User: "write me a post"

Agent: 
- Loads conversation history (empty)
- Uses tools to fetch data
- Generates 3 variations
- Saves response to DB

User: "write the 3rd variation"

Agent:
- Loads conversation history (sees previous response)
- Parses "3rd variation" reference
- Extracts exact text of Variation 3 from history
- Returns that exact text

User: "make it shorter"

Agent:
- Loads conversation history (sees Variation 3)
- Takes that specific text
- Shortens it
- Returns shortened version
```

---

## Testing

Test these scenarios:

```typescript
// Test 1: Basic reference
User: "write me a post"
Agent: [3 variations]
User: "send me variation 2"
Expected: Exact text of variation 2

// Test 2: Chained references
User: "write me a post"
Agent: [3 variations]
User: "write variation 1"
Agent: [Variation 1 full text]
User: "make it more casual"
Expected: Casual version of variation 1

// Test 3: Vague references
User: "write me a post"
Agent: [3 variations]
User: "the second one"
Expected: Exact text of variation 2
```

---

## Key Takeaways

1. **Always pass conversation history** - Agent needs context
2. **Save messages immediately** - Before AND after agent runs
3. **Include chat_id in agent calls** - Required for loading history
4. **Structured output helps** - Makes parsing references easier
5. **System prompt clarity** - Tell agent to check history first

This fixes the hallucination issue completely.