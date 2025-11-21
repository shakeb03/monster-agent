import OpenAI from 'openai';
import { createAdminClient } from '@/lib/supabase/admin';

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
  {
    type: 'function',
    function: {
      name: 'get_previous_response',
      description: 'Get your previous response from conversation history. Use this when user refers to "variation 3", "the second one", "that post", etc. IMPORTANT: Conversation history is already included in messages, so you can also just look at it directly.',
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
  },
];

export async function runAgent(
  userId: string,
  userMessage: string,
  chatId: string // Now required!
): Promise<AgentResponse> {
  const supabase = createAdminClient();

  // Get user from DB
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
      content: `You are an intelligent LinkedIn content agent with conversation memory.

## HANDLING USER REFERENCES
When user says:
- "write variation 3" → Extract variation 3 from YOUR last response in the conversation history
- "the second one" → Extract the second item from YOUR last response
- "that post" → Reference the most recent post you generated
- "improve it" → Reference the most recent content
- "make it shorter" → Reference the last thing you showed and shorten it

## CRITICAL RULES
1. When user refers to "variation 3", "the second one", "that post", etc., look at YOUR PREVIOUS RESPONSES in the conversation history
2. Maintain continuity - remember what you generated before
3. If user asks to "write variation 3", output EXACTLY what you showed as variation 3 in your last response
4. Never generate new content when user is referencing something you already created
5. You have FULL conversation history - use it!

## PROCESS
1. Check if user is referencing previous content (look at conversation history)
2. If yes: Extract the exact content they're referencing from YOUR previous messages
3. If no: Gather context using tools and generate new content
4. Respond with specific content or modification

## TOOLS
Use tools to fetch NEW data (user profile, patterns, etc.)
Do NOT use tools for content you already generated

The user has already completed onboarding - you have access to their:
- Voice analysis and writing style
- Proven viral patterns
- Top-performing posts
- Goals and objectives

NEVER ask the user for information you can fetch yourself. Be proactive and intelligent.

Always gather context BEFORE generating NEW content. Never respond with questions - respond with content.`,
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
      tools: AGENT_TOOLS as any,
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
          // Merge gathered context with any additional context from tool args
          const fullContext = {
            ...contextGathered,
            ...(toolArgs.context || {}),
          };
          toolResult = await generateViralContent(
            toolArgs.user_id,
            toolArgs.topic || 'general',
            toolArgs.tone,
            fullContext
          );
          break;

        case 'get_previous_response':
          toolResult = await getPreviousResponse(
            toolArgs.chat_id,
            toolArgs.query
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
  const supabase = createAdminClient();

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
  const supabase = createAdminClient();

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
  const supabase = createAdminClient();

  let query = supabase
    .from('linkedin_posts')
    .select('post_text, engagement_rate, post_analysis(tone, what_worked, hook_analysis)')
    .eq('user_id', userId)
    .gte('engagement_rate', 5)
    .order('engagement_rate', { ascending: false });

  const { data: posts } = await query.limit(limit);

  return (posts || []).map((p: any) => ({
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
  // Safely destructure with defaults
  // Note: context.profile contains {profile, voice, goals} from getUserProfile
  const { 
    profile: userProfileData = {}, 
    patterns = [], 
    topPosts = [] 
  } = context || {};

  // Extract nested profile and voice from userProfileData
  const profileInfo = userProfileData.profile || {};
  const voiceInfo = userProfileData.voice || {};

  const prompt = `Create 3 LinkedIn post variations for this user.

USER PROFILE:
${Object.keys(profileInfo).length > 0 
  ? JSON.stringify(profileInfo, null, 2) 
  : 'No profile data available'}

VOICE & STYLE:
${Object.keys(voiceInfo).length > 0 
  ? JSON.stringify(voiceInfo, null, 2) 
  : 'No voice analysis available'}

PROVEN VIRAL PATTERNS:
${patterns.length > 0 
  ? patterns.map((p: any) => `- [${p.pattern_type}] ${p.pattern_description} (${p.success_rate}% success)`).join('\n')
  : 'No patterns available - use general best practices'}

TOP PERFORMING POSTS:
${topPosts.length > 0
  ? topPosts.map((p: any, i: number) => `
Post ${i + 1} (${p.engagement}% engagement):
Hook: "${p.hook}"
What worked: ${p.whatWorked}
`).join('\n')
  : 'No top posts available - create engaging content using best practices'}

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

async function getPreviousResponse(chatId: string, query: string) {
  const supabase = createAdminClient();

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
    note: 'Conversation history is already included in the messages array, so you can also reference it directly.',
  };
}

// Streaming version of agent for real-time responses
export async function runAgentStreaming(
  userId: string,
  userMessage: string,
  chatId: string,
  onChunk: (text: string) => void
): Promise<void> {
  const supabase = createAdminClient();

  // Get user from DB
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (!user) {
    throw new Error('User not found');
  }

  // Load conversation history
  const { data: previousMessages } = await supabase
    .from('messages')
    .select('role, content')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
    .limit(20);

  // First, gather context using agent tools (non-streaming)
  const messages: any[] = [
    {
      role: 'system',
      content: `You are an intelligent LinkedIn content agent with conversation memory. Gather necessary context using tools, then generate content. Remember previous responses in the conversation.`,
    },
    ...(previousMessages || []).map(msg => ({
      role: msg.role,
      content: msg.content,
    })),
    {
      role: 'user',
      content: userMessage,
    },
  ];

  let contextGathered: any = {};
  let iterations = 0;
  const MAX_ITERATIONS = 3;

  // Gather context phase (non-streaming)
  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      tools: AGENT_TOOLS as any,
      tool_choice: 'auto',
      temperature: 0.7,
    });

    const message = response.choices[0].message;
    messages.push(message);

    // If no tool calls, break and start streaming
    if (!message.tool_calls || message.tool_calls.length === 0) {
      break;
    }

    // Execute tool calls to gather context
    for (const toolCall of message.tool_calls) {
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments);

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

  // Now stream the final generation
  messages.push({
    role: 'user',
    content: `Now generate the content using the gathered context. Stream your response.`,
  });

  const stream = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    stream: true,
    temperature: 0.8,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    if (content) {
      onChunk(content);
    }
  }
}

