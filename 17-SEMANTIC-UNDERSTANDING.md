# 17-SEMANTIC-UNDERSTANDING.md - Context-Aware Agent

## Problem
User says "let's go with Mem" and agent asks "memory management?" even though user has 2 posts explicitly about Mem/Readwise bridge.

**Root cause:** Agent fetches posts but doesn't semantically understand them.

---

## Step 1: Create Semantic Context Builder

Create `lib/agent/semantic-context.ts`:

```typescript
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

interface SemanticContext {
  userProjects: Array<{
    name: string;
    description: string;
    sourcePost: string;
    keywords: string[];
  }>;
  userExpertise: string[];
  recentWork: string[];
  contextualKnowledge: Record<string, any>;
}

export async function buildSemanticContext(userId: string): Promise<SemanticContext> {
  const supabase = await createClient();

  // Get ALL recent posts (not just top performing)
  const { data: posts } = await supabase
    .from('linkedin_posts')
    .select('post_text, posted_at')
    .eq('user_id', userId)
    .order('posted_at', { ascending: false })
    .limit(20);

  if (!posts || posts.length === 0) {
    return {
      userProjects: [],
      userExpertise: [],
      recentWork: [],
      contextualKnowledge: {},
    };
  }

  // Use GPT to extract semantic understanding
  const extractionPrompt = `Analyze these LinkedIn posts and extract structured knowledge about what this person has built and knows.

POSTS:
${posts.map((p, i) => `
Post ${i + 1}:
${p.post_text}
---
`).join('\n')}

Extract:
1. PROJECTS they've built (with names and descriptions)
2. TECHNOLOGIES/TOOLS they use (specific names)
3. PROBLEMS they've solved
4. DOMAIN EXPERTISE

Be specific about project names (e.g., "Mem bridge", "Echoes OS", "Readwise sync").
Be specific about tool names (e.g., "Mem", "Readwise", "Vercel", not just "note-taking app").

Return JSON:
{
  "projects": [
    {
      "name": "exact name from post",
      "description": "what it does",
      "technologies": ["tech1", "tech2"],
      "keywords": ["mem", "readwise", "sync"] // searchable terms
    }
  ],
  "expertise": ["specific domain or skill"],
  "tools_mentioned": ["Mem", "Readwise", "Vercel"],
  "recent_work": ["what they're currently working on"]
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You extract structured knowledge from posts. Be specific with names and technologies.',
      },
      { role: 'user', content: extractionPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const extracted = JSON.parse(response.choices[0].message.content || '{}');

  // Build contextual knowledge map
  const contextualKnowledge: Record<string, any> = {};

  // Map common terms to what user actually means
  extracted.projects?.forEach((project: any) => {
    const allKeywords = [
      project.name.toLowerCase(),
      ...project.keywords?.map((k: string) => k.toLowerCase()) || [],
      ...project.technologies?.map((t: string) => t.toLowerCase()) || [],
    ];

    allKeywords.forEach((keyword: string) => {
      contextualKnowledge[keyword] = {
        type: 'project',
        name: project.name,
        description: project.description,
        context: `User built ${project.name}: ${project.description}`,
      };
    });
  });

  extracted.tools_mentioned?.forEach((tool: string) => {
    contextualKnowledge[tool.toLowerCase()] = {
      type: 'tool',
      name: tool,
      context: `User has experience with ${tool}`,
    };
  });

  return {
    userProjects: extracted.projects || [],
    userExpertise: extracted.expertise || [],
    recentWork: extracted.recent_work || [],
    contextualKnowledge,
  };
}

export async function resolveUserIntent(
  userMessage: string,
  semanticContext: SemanticContext
): Promise<{
  resolved: boolean;
  topic?: string;
  context?: string;
  matchedProject?: any;
}> {
  const lowerMessage = userMessage.toLowerCase();

  // Check if message matches any known context
  for (const [keyword, knowledge] of Object.entries(semanticContext.contextualKnowledge)) {
    if (lowerMessage.includes(keyword)) {
      return {
        resolved: true,
        topic: knowledge.name,
        context: knowledge.context,
        matchedProject: knowledge.type === 'project' ? knowledge : null,
      };
    }
  }

  // Try semantic matching with GPT
  const matchPrompt = `User said: "${userMessage}"

Known context about this user:
${JSON.stringify(semanticContext, null, 2)}

Does the user's message refer to any of their known projects or topics?

Return JSON:
{
  "matches": true/false,
  "matched_project": "project name if matched",
  "confidence": 0-1,
  "reasoning": "why it matches or doesn't"
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: matchPrompt }],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const result = JSON.parse(response.choices[0].message.content || '{}');

  if (result.matches && result.confidence > 0.7) {
    const project = semanticContext.userProjects.find(
      p => p.name.toLowerCase() === result.matched_project?.toLowerCase()
    );

    return {
      resolved: true,
      topic: result.matched_project,
      context: project?.description || '',
      matchedProject: project,
    };
  }

  return { resolved: false };
}
```

---

## Step 2: Update Agent to Use Semantic Context

Update `lib/agent/orchestrator.ts`:

```typescript
import { buildSemanticContext, resolveUserIntent } from '@/lib/agent/semantic-context';

// Add new tool
const AGENT_TOOLS = [
  // ... existing tools ...
  {
    type: 'function',
    function: {
      name: 'understand_user_context',
      description: 'Build semantic understanding of what user has built and knows. Use this BEFORE asking clarifying questions.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string' },
          user_message: { type: 'string', description: 'What user just said' },
        },
        required: ['user_id', 'user_message'],
      },
    },
  },
];

// Implementation
async function understandUserContext(
  userId: string,
  userMessage: string
): Promise<ToolResult> {
  try {
    // Build semantic context from all posts
    const semanticContext = await buildSemanticContext(userId);

    // Try to resolve what user meant
    const resolution = await resolveUserIntent(userMessage, semanticContext);

    return successResult({
      semanticContext,
      resolution,
      shouldAskForClarification: !resolution.resolved,
    });
  } catch (error) {
    return errorResult('Failed to build context understanding');
  }
}
```

---

## Step 3: Update System Prompt for Context Awareness

```typescript
const systemPrompt = `You are a LinkedIn content strategist with SEMANTIC UNDERSTANDING of the user.

## CRITICAL: UNDERSTAND BEFORE ASKING

ALWAYS call understand_user_context BEFORE asking clarifying questions.

Example of WRONG behavior:
User: "let's write about Mem"
You: "Are you referring to memory management?"
❌ You should have checked their posts first!

Example of RIGHT behavior:
User: "let's write about Mem"
You: [call understand_user_context]
Context: User built "Mem bridge" - a Readwise to Mem sync tool
You: "Got it - the Mem bridge you built! Want to write about the initial build or the production lessons?"
✅ You understood context from their posts!

## YOUR PROCESS

1. User says something (e.g., "write about X")
2. You call understand_user_context(userId, userMessage)
3. Tool returns:
   - semanticContext: what they've built, their expertise
   - resolution: does "X" match anything they've posted about?
4. If resolution.resolved = true:
   - Don't ask "what is X?"
   - Use the matched context
   - Ask strategic questions (angle, depth, etc.)
5. If resolution.resolved = false:
   - Then ask what they mean

## EXAMPLES

User: "write about mem"
Tool: { resolved: true, topic: "Mem bridge", context: "Readwise to Mem sync tool" }
You: "The Mem bridge! Want to write about the initial build, the production issues, or the UX decisions?"

User: "write about system design"
Tool: { resolved: false }
You: "System design is broad. What specific aspect - the constraints you've learned from (like Vercel timeouts), a project you built, or general principles?"

User: "write about that bridge thing"
Tool: { resolved: true, topic: "Mem bridge", confidence: 0.9 }
You: "The Mem bridge you built! Are you thinking about the technical architecture or the lessons from production?"

## KEY PRINCIPLE

Never ask about things you can learn from their posts. Use semantic understanding FIRST.`;
```

---

## Step 4: Cache Semantic Context

Create `lib/agent/context-cache.ts`:

```typescript
// Cache semantic context to avoid rebuilding every time
const contextCache = new Map<string, { context: SemanticContext; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

export async function getCachedSemanticContext(userId: string): Promise<SemanticContext> {
  const cached = contextCache.get(userId);
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.context;
  }

  // Rebuild context
  const context = await buildSemanticContext(userId);
  contextCache.set(userId, { context, timestamp: now });

  return context;
}

export function invalidateContextCache(userId: string): void {
  contextCache.delete(userId);
}
```

---

## Step 5: Store Extracted Knowledge in Database

Add table for faster lookups:

```sql
CREATE TABLE user_semantic_context (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    projects JSONB DEFAULT '[]'::jsonb,
    expertise TEXT[],
    tools_mentioned TEXT[],
    contextual_knowledge JSONB DEFAULT '{}'::jsonb,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_user_semantic_context_user_id ON user_semantic_context(user_id);
CREATE INDEX idx_user_semantic_context_updated ON user_semantic_context(last_updated);

-- Trigger to refresh when new posts are added
CREATE OR REPLACE FUNCTION refresh_semantic_context()
RETURNS TRIGGER AS $$
BEGIN
    -- Mark context as stale (will be regenerated on next request)
    UPDATE user_semantic_context 
    SET last_updated = NOW() - INTERVAL '2 hours'
    WHERE user_id = NEW.user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER refresh_context_on_new_post
    AFTER INSERT ON linkedin_posts
    FOR EACH ROW
    EXECUTE FUNCTION refresh_semantic_context();
```

---

## Step 6: Create Smart Context Lookup

Create `lib/agent/context-lookup.ts`:

```typescript
export async function smartContextLookup(
  userId: string,
  query: string
): Promise<{ found: boolean; context: string; confidence: number }> {
  const supabase = await createClient();

  // Try exact keyword match first (fast)
  const keywords = query.toLowerCase().split(' ');
  
  const { data: semanticContext } = await supabase
    .from('user_semantic_context')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (semanticContext?.contextual_knowledge) {
    for (const keyword of keywords) {
      if (semanticContext.contextual_knowledge[keyword]) {
        return {
          found: true,
          context: semanticContext.contextual_knowledge[keyword].context,
          confidence: 1.0,
        };
      }
    }
  }

  // Fallback to vector search on post embeddings
  const queryEmbedding = await generateEmbedding(query);

  const { data: similarPosts } = await supabase.rpc('match_posts', {
    query_embedding: queryEmbedding,
    match_threshold: 0.7,
    match_count: 3,
    filter_user_id: userId,
  });

  if (similarPosts && similarPosts.length > 0) {
    return {
      found: true,
      context: `Related to: ${similarPosts[0].post_text.substring(0, 200)}...`,
      confidence: similarPosts[0].similarity,
    };
  }

  return { found: false, context: '', confidence: 0 };
}

// PostgreSQL function for vector similarity search
/*
CREATE OR REPLACE FUNCTION match_posts(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  filter_user_id uuid
)
RETURNS TABLE (
  id uuid,
  post_text text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    linkedin_posts.id,
    linkedin_posts.post_text,
    1 - (linkedin_posts.embedding <=> query_embedding) as similarity
  FROM linkedin_posts
  WHERE linkedin_posts.user_id = filter_user_id
    AND 1 - (linkedin_posts.embedding <=> query_embedding) > match_threshold
  ORDER BY linkedin_posts.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
*/
```

---

## Step 7: Example Flow After Fix

### Before (WRONG):
```
User: "let's go with Mem"
Agent: "Are you referring to memory management?"
User: "no, Mem AI"
Agent: "Got it! Mem AI sounds fascinating..."
User: "no, the Mem bridge I built"
Agent: "Ah, thanks for clarifying!"
```

### After (RIGHT):
```
User: "let's go with Mem"

Agent:
[Calls understand_user_context]
→ Finds in posts: "Mem bridge - Readwise to Mem sync tool"
→ Resolution: { resolved: true, topic: "Mem bridge", confidence: 0.95 }

"Got it - the Mem bridge you built! 

You've written about:
• The initial build (the fun UX stuff)
• Production issues (the 5000 highlights problem)

Want to write about a new angle, or go deeper on one of these?"
```

---

## Step 8: Prevent Redundant Content

Add to semantic understanding:

```typescript
export async function preventRedundantContent(
  userId: string,
  proposedTopic: string
): Promise<{ alreadyCovered: boolean; posts: any[]; suggestion: string }> {
  const supabase = await createClient();

  // Search for posts about this topic
  const { data: posts } = await supabase
    .from('linkedin_posts')
    .select('post_text, posted_at, engagement_rate')
    .eq('user_id', userId)
    .textSearch('post_text', proposedTopic);

  if (!posts || posts.length === 0) {
    return {
      alreadyCovered: false,
      posts: [],
      suggestion: 'Fresh topic!',
    };
  }

  // Analyze what angles were covered
  const angles = posts.map(p => {
    if (p.post_text.includes('failed') || p.post_text.includes('broke')) return 'failure story';
    if (p.post_text.includes('built') || p.post_text.includes('weekend')) return 'build story';
    if (p.post_text.includes('learned') || p.post_text.includes('taught me')) return 'lessons';
    return 'other';
  });

  const uncoveredAngles = ['failure story', 'build story', 'lessons', 'deep dive', 'tips']
    .filter(angle => !angles.includes(angle));

  return {
    alreadyCovered: true,
    posts,
    suggestion: uncoveredAngles.length > 0
      ? `You've covered this from ${angles.join(', ')} angles. Try: ${uncoveredAngles[0]}`
      : 'You\'ve covered this extensively. Suggest a fresh topic or new angle.',
  };
}
```

---

## Expected Results

### Understanding "Mem"
```
Semantic context extracted:
{
  "projects": [
    {
      "name": "Mem bridge",
      "description": "Readwise to Mem sync tool with visual pipeline",
      "keywords": ["mem", "readwise", "bridge", "sync", "highlights"]
    },
    {
      "name": "Echoes OS",
      "description": "AI second brain for knowledge management",
      "keywords": ["echoes", "ai", "second brain", "knowledge"]
    }
  ],
  "tools_mentioned": ["Mem", "Readwise", "Vercel", "Reddit", "Twitter"],
  "expertise": ["system design", "serverless", "API integration", "UX design"]
}

Query: "let's write about Mem"
Resolution: {
  "matched": "Mem bridge",
  "confidence": 0.98,
  "context": "Readwise to Mem sync tool you built"
}
```

### No More Guessing
Agent will NEVER ask:
- "Are you referring to memory management?"
- "Mem AI?"
- "What is Mem?"

Agent will ALWAYS understand from context.

---

## Implementation Priority

1. ✅ Build semantic context extraction (Step 1)
2. ✅ Add understand_user_context tool (Step 2)
3. ✅ Update system prompt (Step 3)
4. Cache for performance (Step 4)
5. Store in database (Step 5)
6. Add vector search fallback (Step 6)

This gives your agent ACTUAL UNDERSTANDING, not just keyword matching.