import OpenAI from 'openai';
import { createAdminClient } from '@/lib/supabase/admin';

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
  const supabase = createAdminClient();

  console.log('[content-analyzer] Analyzing strategy for user:', userId);

  // Get user's recent posts (last 10)
  const { data: posts } = await supabase
    .from('linkedin_posts')
    .select('id, post_text, posted_at')
    .eq('user_id', userId)
    .order('posted_at', { ascending: false })
    .limit(10);

  // Get post analysis for these posts
  if (posts && posts.length > 0) {
    const postIds = posts.map(p => p.id);
    const { data: analyses } = await supabase
      .from('post_analysis')
      .select('post_id, topics')
      .in('post_id', postIds);

    // Merge analysis with posts
    posts.forEach(post => {
      const analysis = analyses?.find(a => a.post_id === post.id);
      (post as any).post_analysis = analysis;
    });
  }

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

  console.log('[content-analyzer] Found', posts?.length || 0, 'recent posts');

  if (!posts || posts.length === 0) {
    return {
      recentTopics: [],
      topicFrequency: {},
      lastPostDate: null,
      contentGaps: voice?.common_topics || [],
      suggestedNextTopics: voice?.common_topics?.slice(0, 3) || [],
      reasonings: ['No recent posts to analyze. Suggested topics from your expertise.'],
      userGoals: user?.goals || [],
    };
  }

  // Analyze topic distribution
  const topicCounts: Record<string, number> = {};
  const allTopics: string[] = [];

  posts.forEach(post => {
    const topics = (post as any).post_analysis?.topics || [];
    topics.forEach((topic: string) => {
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      allTopics.push(topic);
    });
  });

  // Find content gaps
  const userExpertise = voice?.common_topics || [];
  const recentTopicsSet = new Set(allTopics);
  const contentGaps = userExpertise.filter(topic => !recentTopicsSet.has(topic));

  console.log('[content-analyzer] Topic counts:', topicCounts);
  console.log('[content-analyzer] Content gaps:', contentGaps);

  // Use GPT to suggest strategic next topics
  const strategyPrompt = `Analyze this LinkedIn content strategy:

RECENT POSTS (last 10):
${posts.map((p, i) => `${i + 1}. Topics: ${(p as any).post_analysis?.topics?.join(', ') || 'none'}`).join('\n')}

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

  console.log('[content-analyzer] Generated', result.suggestions?.length || 0, 'suggestions');

  return {
    recentTopics: [...new Set(allTopics)],
    topicFrequency: topicCounts,
    lastPostDate: posts[0]?.posted_at || null,
    contentGaps,
    suggestedNextTopics: result.suggestions?.map((s: any) => s.topic) || [],
    reasonings: result.suggestions?.map((s: any) => s.reasoning) || [],
    userGoals: user?.goals || [],
  };
}

