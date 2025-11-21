import { createAdminClient } from '@/lib/supabase/admin';

interface ViralPromptContext {
  voiceAnalysis: any;
  topPatterns: any[];
  recentFeedback: any[];
  userGoals: string[];
}

export async function buildViralPrompt(
  userId: string,
  context: ViralPromptContext
): Promise<string> {
  const { voiceAnalysis, topPatterns, recentFeedback, userGoals } = context;

  // Extract only the most critical information
  const hookPatterns = topPatterns
    .filter(p => p.pattern_type === 'hook')
    .slice(0, 3)
    .map(p => p.pattern_description);

  const emotionTriggers = topPatterns
    .filter(p => p.pattern_type === 'emotion')
    .slice(0, 3)
    .map(p => p.pattern_description);

  const formatRules = topPatterns
    .filter(p => p.pattern_type === 'format')
    .slice(0, 2)
    .map(p => p.pattern_description);

  return `You are a LinkedIn content strategist specializing in creating viral, high-engagement posts for this specific user.

## USER VOICE (Proven from Data)
Tone: ${voiceAnalysis?.overall_tone || 'professional'}
Style: ${voiceAnalysis?.writing_style || 'clear and direct'}
Core Topics: ${voiceAnalysis?.common_topics?.slice(0, 5).join(', ') || 'general business'}

## PROVEN VIRAL HOOKS (Use These Formulas)
${hookPatterns.map((h, i) => `${i + 1}. ${h}`).join('\n') || '1. Start with a bold statement or question'}

## EMOTIONAL TRIGGERS THAT WORK
${emotionTriggers.map((e, i) => `${i + 1}. ${e}`).join('\n') || '1. Curiosity and surprise'}

## FORMAT RULES (Non-Negotiable)
${formatRules.map((f, i) => `${i + 1}. ${f}`).join('\n') || '1. Use line breaks for readability'}

## RECENT USER FEEDBACK
${recentFeedback.slice(0, 3).map(f => `- ${f.feedback}`).join('\n') || 'No recent feedback'}

## USER GOALS
${userGoals.map((g, i) => `${i + 1}. ${g}`).join('\n')}

## YOUR MANDATE
1. Every post MUST use at least one proven viral hook formula
2. Every post MUST activate proven emotional triggers
3. Every post MUST follow format rules exactly
4. NEVER be generic - always specific, bold, and engaging
5. Aim for top 10% engagement based on user's historical data

## OUTPUT FORMAT
For each request:
1. Generate 3 post variations (different hooks, same message)
2. For each variation, specify:
   - Which viral pattern(s) used
   - Expected engagement score (1-10)
   - Why it will perform well
   - Suggested posting time
3. Recommend the best variation with reasoning

Be direct, specific, and data-driven. Generic advice fails.`;
}

export async function getViralPromptContext(
  userId: string
): Promise<ViralPromptContext> {
  const supabase = createAdminClient();

  // Voice analysis
  const { data: voiceAnalysis } = await supabase
    .from('voice_analysis')
    .select('*')
    .eq('user_id', userId)
    .single();

  // Top patterns
  const { data: topPatterns } = await supabase
    .from('viral_patterns')
    .select('*')
    .eq('user_id', userId)
    .order('success_rate', { ascending: false })
    .limit(10);

  // User goals
  const { data: user } = await supabase
    .from('users')
    .select('goals')
    .eq('id', userId)
    .single();

  return {
    voiceAnalysis,
    topPatterns: topPatterns || [],
    recentFeedback: [],
    userGoals: user?.goals || [],
  };
}

