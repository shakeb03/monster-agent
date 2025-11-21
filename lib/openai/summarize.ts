import { openai, MODELS } from './client';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export async function summarizeConversation(
  messages: Message[]
): Promise<string> {
  const conversationText = messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  const prompt = `Summarize the following conversation concisely, preserving key points, decisions, and context that would be important for future interactions:

${conversationText}

Provide a comprehensive summary that captures:
1. Main topics discussed
2. User's goals and preferences
3. Key decisions or conclusions
4. Important context for future conversations`;

  try {
    const response = await openai.chat.completions.create({
      model: MODELS.GPT4O_MINI,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert at summarizing conversations while preserving important context.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });

    return response.choices[0].message.content || '';
  } catch (error) {
    console.error('Summarization error:', error);
    throw new Error('Failed to summarize conversation');
  }
}

export async function summarizeLongContext(
  contextText: string
): Promise<string> {
  const prompt = `Condense the following context while preserving all critical information, user preferences, goals, and important details:

${contextText}

Create a comprehensive but concise summary that maintains the essential information needed for personalized assistance.`;

  try {
    const response = await openai.chat.completions.create({
      model: MODELS.GPT4O_MINI,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert at condensing long context while preserving critical information.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.2,
      max_tokens: 2000,
    });

    return response.choices[0].message.content || '';
  } catch (error) {
    console.error('Context summarization error:', error);
    throw new Error('Failed to summarize context');
  }
}

