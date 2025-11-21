import { openai, MODELS } from './client';

interface PostAnalysisResult {
  tone: string;
  topics: string[];
  hook_analysis: string;
  engagement_analysis: string;
  what_worked: string;
  what_didnt_work: string;
  posting_time: string;
}

interface VoiceAnalysisResult {
  overall_tone: string;
  writing_style: string;
  common_topics: string[];
  posting_patterns: {
    frequency: string;
    best_times: string[];
    post_length: string;
  };
  engagement_patterns: {
    high_performers: string;
    low_performers: string;
  };
  strengths: string[];
  weaknesses: string[];
  top_performing_elements: string[];
  recommendations: string[];
  analysis_summary: string;
}

export async function analyzePost(
  postText: string,
  metrics: {
    likesCount: number;
    commentsCount: number;
    sharesCount: number;
    engagementRate: number | null;
  }
): Promise<PostAnalysisResult> {
  const prompt = `Analyze this LinkedIn post and provide detailed insights:

Post Text: ${postText}
Likes: ${metrics.likesCount}
Comments: ${metrics.commentsCount}
Shares: ${metrics.sharesCount}
Engagement Rate: ${metrics.engagementRate}%

Provide analysis in the following JSON format:
{
  "tone": "professional/casual/inspirational/educational/etc",
  "topics": ["topic1", "topic2", "topic3"],
  "hook_analysis": "Analysis of the opening hook and its effectiveness",
  "engagement_analysis": "Why this post did or didn't perform well",
  "what_worked": "Specific elements that contributed to success",
  "what_didnt_work": "Areas for improvement",
  "posting_time": "HH:MM format of when posted"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: MODELS.GPT4O_MINI,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert LinkedIn content analyst. Provide detailed, actionable insights in JSON format.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0].message.content || '{}';
    return JSON.parse(content);
  } catch (error) {
    console.error('Post analysis error:', error);
    throw new Error('Failed to analyze post');
  }
}

export async function analyzeVoice(
  posts: Array<{
    text: string;
    engagementRate: number | null;
  }>
): Promise<VoiceAnalysisResult> {
  const postsText = posts
    .slice(0, 20)
    .map((p, i) => `Post ${i + 1}: ${p.text}\nEngagement: ${p.engagementRate}%`)
    .join('\n\n');

  const prompt = `Based on these ${posts.length} LinkedIn posts, create a comprehensive voice and style profile:

${postsText}

Provide analysis in the following JSON format:
{
  "overall_tone": "Description of overall tone",
  "writing_style": "Description of writing style and patterns",
  "common_topics": ["topic1", "topic2", "topic3"],
  "posting_patterns": {
    "frequency": "Description",
    "best_times": ["time1", "time2"],
    "post_length": "Short/Medium/Long"
  },
  "engagement_patterns": {
    "high_performers": "What drives high engagement",
    "low_performers": "What hurts engagement"
  },
  "strengths": ["strength1", "strength2", "strength3"],
  "weaknesses": ["weakness1", "weakness2"],
  "top_performing_elements": ["element1", "element2", "element3"],
  "recommendations": ["rec1", "rec2", "rec3"],
  "analysis_summary": "2-3 sentence summary of their LinkedIn voice"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: MODELS.GPT4O_MINI,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert LinkedIn content strategist. Create a detailed voice profile.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0].message.content || '{}';
    return JSON.parse(content);
  } catch (error) {
    console.error('Voice analysis error:', error);
    throw new Error('Failed to analyze voice');
  }
}

