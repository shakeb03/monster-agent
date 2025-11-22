import OpenAI from 'openai';
import { createAdminClient } from '@/lib/supabase/admin';

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
  const supabase = createAdminClient();

  console.log('[semantic-context] Building context for user:', userId);

  // Get ALL recent posts (not just top performing)
  const { data: posts } = await supabase
    .from('linkedin_posts')
    .select('post_text, posted_at')
    .eq('user_id', userId)
    .order('posted_at', { ascending: false })
    .limit(20);

  if (!posts || posts.length === 0) {
    console.log('[semantic-context] No posts found');
    return {
      userProjects: [],
      userExpertise: [],
      recentWork: [],
      contextualKnowledge: {},
    };
  }

  console.log('[semantic-context] Analyzing', posts.length, 'posts');

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

  console.log('[semantic-context] Extracted', extracted.projects?.length || 0, 'projects');
  console.log('[semantic-context] Found', extracted.tools_mentioned?.length || 0, 'tools');

  // Build contextual knowledge map
  const contextualKnowledge: Record<string, any> = {};

  // Map common terms to what user actually means
  extracted.projects?.forEach((project: any) => {
    const allKeywords = [
      project.name.toLowerCase(),
      ...(project.keywords?.map((k: string) => k.toLowerCase()) || []),
      ...(project.technologies?.map((t: string) => t.toLowerCase()) || []),
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
    const toolLower = tool.toLowerCase();
    if (!contextualKnowledge[toolLower]) {
      contextualKnowledge[toolLower] = {
        type: 'tool',
        name: tool,
        context: `User has experience with ${tool}`,
      };
    }
  });

  console.log('[semantic-context] Built knowledge map with', Object.keys(contextualKnowledge).length, 'entries');

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

  console.log('[resolve-intent] Resolving:', userMessage);

  // Check if message matches any known context
  for (const [keyword, knowledge] of Object.entries(semanticContext.contextualKnowledge)) {
    if (lowerMessage.includes(keyword)) {
      console.log('[resolve-intent] Matched keyword:', keyword, '→', knowledge.name);
      return {
        resolved: true,
        topic: knowledge.name,
        context: knowledge.context,
        matchedProject: knowledge.type === 'project' ? knowledge : null,
      };
    }
  }

  // Try semantic matching with GPT
  console.log('[resolve-intent] No keyword match, trying semantic matching');

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

  console.log('[resolve-intent] Semantic match result:', result);

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

  console.log('[resolve-intent] No match found');
  return { resolved: false };
}

export async function preventRedundantContent(
  userId: string,
  proposedTopic: string
): Promise<{ alreadyCovered: boolean; posts: any[]; suggestion: string }> {
  const supabase = createAdminClient();

  console.log('[prevent-redundant] Checking topic:', proposedTopic);

  // Search for posts about this topic
  const { data: posts } = await supabase
    .from('linkedin_posts')
    .select('post_text, posted_at, engagement_rate')
    .eq('user_id', userId)
    .ilike('post_text', `%${proposedTopic}%`);

  if (!posts || posts.length === 0) {
    console.log('[prevent-redundant] Fresh topic!');
    return {
      alreadyCovered: false,
      posts: [],
      suggestion: 'Fresh topic!',
    };
  }

  console.log('[prevent-redundant] Found', posts.length, 'existing posts');

  // Analyze what angles were covered
  const angles = posts.map(p => {
    const text = p.post_text.toLowerCase();
    if (text.includes('failed') || text.includes('broke')) return 'failure story';
    if (text.includes('built') || text.includes('weekend')) return 'build story';
    if (text.includes('learned') || text.includes('taught me')) return 'lessons';
    return 'other';
  });

  const uncoveredAngles = ['failure story', 'build story', 'lessons', 'deep dive', 'tips']
    .filter(angle => !angles.includes(angle));

  const suggestion = uncoveredAngles.length > 0
    ? `You've covered this from ${[...new Set(angles)].join(', ')} angles. Try: ${uncoveredAngles[0]}`
    : 'You\'ve covered this extensively. Suggest a fresh topic or new angle.';

  console.log('[prevent-redundant] Suggestion:', suggestion);

  return {
    alreadyCovered: true,
    posts,
    suggestion,
  };
}

