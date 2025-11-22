import OpenAI from 'openai';
import type { ContentStrategy } from '../strategy/content-analyzer';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface RefinedIntent {
  topic: string;
  angle: string;
  confirmed: boolean;
}

export async function handleContentRequest(
  userMessage: string,
  strategy: ContentStrategy,
  conversationHistory: ConversationMessage[]
): Promise<{ response: string; shouldGenerate: boolean; refinedIntent: RefinedIntent | null }> {
  
  console.log('[conversational-mode] Handling message, history length:', conversationHistory.length);

  // Check if we have enough information to generate
  const hasEnoughInfo = checkIfReadyToGenerate(conversationHistory);

  console.log('[conversational-mode] Ready to generate:', hasEnoughInfo);

  if (hasEnoughInfo) {
    return {
      response: '', // Will generate content
      shouldGenerate: true,
      refinedIntent: extractIntentFromConversation(conversationHistory),
    };
  }

  // Build conversational prompt
  const conversationPrompt = `You are a LinkedIn content strategist having a conversation with a user about their next post.

USER'S CONTENT STRATEGY:
- Recent topics: ${strategy.recentTopics?.slice(0, 5).join(', ') || 'None'}
- Content gaps: ${strategy.contentGaps?.join(', ') || 'None'}
- Goals: ${strategy.userGoals?.join(', ') || 'Not specified'}

STRATEGIC SUGGESTIONS:
${strategy.reasonings?.map((r: string, i: number) => `${i + 1}. ${strategy.suggestedNextTopics[i]}: ${r}`).join('\n') || 'No specific suggestions'}

CONVERSATION SO FAR:
${conversationHistory.map((m: any) => `${m.role}: ${m.content}`).join('\n')}

USER'S LATEST MESSAGE:
${userMessage}

YOUR JOB:
1. If user said something vague like "draft my next post", ask what they want to talk about
2. Suggest strategic topics based on their content gaps and goals
3. Ask clarifying questions to understand their angle
4. Once you understand (topic + angle + goal), confirm and say you'll generate

BE CONVERSATIONAL. Don't be robotic. Ask one question at a time. Suggest options.

Examples:
- "I see you haven't posted about [gap topic] lately. Want to write about that? Or something else on your mind?"
- "Cool! Leadership it is. What angle - a personal story, a contrarian take, or practical advice?"
- "Got it. Since your goal is [goal], we could tie this to [specific angle]. Sound good?"

Response (natural, conversational, one question at a time):`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are a content strategist. Be conversational, helpful, and strategic. Guide users to create content that fits their narrative.',
      },
      { role: 'user', content: conversationPrompt },
    ],
    temperature: 0.8,
    max_tokens: 300,
  });

  return {
    response: response.choices[0].message.content || '',
    shouldGenerate: false,
    refinedIntent: null,
  };
}

function checkIfReadyToGenerate(history: ConversationMessage[]): boolean {
  // Check if conversation has covered: topic, angle, and confirmation
  const conversationText = history.map(m => m.content).join(' ').toLowerCase();
  
  const hasTopic = history.some(m => 
    m.role === 'user' && 
    m.content.length > 10 && 
    !m.content.toLowerCase().includes('draft') &&
    !m.content.toLowerCase().includes('write')
  );

  const hasConfirmation = conversationText.includes('yes') || 
                         conversationText.includes('sounds good') ||
                         conversationText.includes('go ahead') ||
                         conversationText.includes('perfect') ||
                         conversationText.includes('let\'s do it');

  // Need at least 3 turns (ask topic, user responds, ask angle, user responds, confirm)
  return history.length >= 5 && hasTopic && hasConfirmation;
}

function extractIntentFromConversation(history: ConversationMessage[]): RefinedIntent {
  // Extract topic, angle, tone from conversation
  const userMessages = history.filter(m => m.role === 'user');
  
  // Simple extraction (can be made more sophisticated)
  const topic = userMessages
    .map(m => m.content)
    .find(c => !c.toLowerCase().includes('draft') && 
               !c.toLowerCase().includes('write') && 
               c.length > 10);

  // Look for angle keywords
  const allText = userMessages.map(m => m.content).join(' ').toLowerCase();
  let angle = 'personal';
  
  if (allText.includes('story') || allText.includes('war story')) {
    angle = 'personal story';
  } else if (allText.includes('advice') || allText.includes('tips')) {
    angle = 'practical advice';
  } else if (allText.includes('contrarian') || allText.includes('hot take')) {
    angle = 'contrarian take';
  } else if (allText.includes('observation')) {
    angle = 'observation';
  }

  return {
    topic: topic || 'general',
    angle,
    confirmed: true,
  };
}
