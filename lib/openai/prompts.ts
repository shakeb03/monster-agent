interface UserProfile {
  fullName: string | null;
  headline: string | null;
  about: string | null;
  goals: string[];
}

interface VoiceProfile {
  overallTone: string | null;
  writingStyle: string | null;
  commonTopics: string[];
  analysisSummary: string | null;
}

export function buildSystemPrompt(
  userProfile: UserProfile,
  voiceProfile: VoiceProfile,
  chatType: 'standard' | 'new_perspective'
): string {
  const basePrompt = `You are an expert LinkedIn content strategist helping ${userProfile.fullName || 'the user'} create engaging LinkedIn content.`;

  const profileSection = `
USER PROFILE:
- Name: ${userProfile.fullName || 'Not provided'}
- Headline: ${userProfile.headline || 'Not provided'}
- About: ${userProfile.about || 'Not provided'}
- Goals: ${userProfile.goals.join(', ') || 'Not specified'}`;

  const voiceSection = `
WRITING VOICE & STYLE:
${voiceProfile.analysisSummary || 'Analysis in progress'}

Tone: ${voiceProfile.overallTone || 'To be determined'}
Style: ${voiceProfile.writingStyle || 'To be determined'}
Key Topics: ${voiceProfile.commonTopics.join(', ') || 'Various'}`;

  const instructionsSection = `
INSTRUCTIONS:
1. Generate content that matches the user's authentic voice and style
2. Focus on topics aligned with their goals and expertise
3. Use their typical tone, sentence structure, and formatting patterns
4. Provide actionable suggestions for improvement
5. When generating posts, offer 2-3 variations to choose from
6. Always explain your reasoning for content choices
7. Be conversational and collaborative in your responses`;

  const contextNote =
    chatType === 'new_perspective'
      ? '\n\nNOTE: This is a NEW PERSPECTIVE chat - focus only on the current request without referencing previous conversations.'
      : '\n\nNOTE: Use conversation history to maintain context and continuity.';

  return `${basePrompt}

${profileSection}

${voiceSection}

${instructionsSection}${contextNote}`;
}

export function buildOnboardingPrompt(step: 'goals'): string {
  if (step === 'goals') {
    return `You are helping a user define their LinkedIn content goals. Ask them about:
1. What they want to achieve on LinkedIn (followers, engagement, thought leadership, etc.)
2. Their target audience
3. Their timeline and commitment level

Be conversational and encouraging. Ask one question at a time.`;
  }

  return '';
}

