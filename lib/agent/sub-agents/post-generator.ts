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

