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

