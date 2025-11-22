import OpenAI from 'openai';
import { createAdminClient } from '@/lib/supabase/admin';
import { successResult, errorResult, ToolResult, getNextOnboardingStep } from './types';
import { validateGenerationContext, containsGenericPhrases } from './validators';
import { validateContentQuality } from './quality-check';
import { generateStrictAuthenticContent } from './strict-generator';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

interface AgentAction {
  tool: string;
  parameters: Record<string, any>;
  reasoning: string;
}

interface AgentResponse {
  finalAnswer: string;
  toolsUsed: string[];
  contextGathered: any;
}

const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_user_profile',
      description: 'Get user LinkedIn profile, voice analysis, and goals. Use this when you need to understand the user\'s style, topics, or objectives.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_viral_patterns',
      description: 'Get proven viral patterns for content creation. Use this when generating posts to ensure high engagement.',
      parameters: {
        type: 'object',
        properties: {
          pattern_types: {
            type: 'array',
            items: { type: 'string' },
            description: 'Types of patterns needed: hook, format, cta, topic, emotion',
          },
          limit: {
            type: 'number',
            description: 'Number of patterns to return (default: 5)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_top_performing_posts',
      description: 'Get user\'s top-performing posts for reference. Use this when you need examples of what works well.',
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description: 'Optional: filter by topic',
          },
          limit: {
            type: 'number',
            description: 'Number of posts to return (default: 3)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_viral_content',
      description: 'Generate LinkedIn post content using user\'s proven patterns and voice. Always use this after gathering context.',
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description: 'Topic or theme for the post',
          },
          tone: {
            type: 'string',
            description: 'Desired tone (optional, defaults to user\'s style)',
          },
          context: {
            type: 'object',
            description: 'Context gathered from other tools',
          },
        },
        required: ['topic', 'context'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_previous_response',
      description: 'Get your previous response from conversation history. Use this when user refers to "variation 3", "the second one", "that post", etc. IMPORTANT: Conversation history is already included in messages, so you can also just look at it directly.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'What to look for (e.g., "variation 3", "second post")',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_user_status',
      description: 'Check user onboarding and data availability. Use this when other tools fail or to diagnose why data is missing.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_from_voice_data',
      description: 'Get analysis insights from voice data when posts are not available. Use as fallback when get_top_performing_posts fails.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reanalyze_posts',
      description: 'Re-run post analysis for user. Use this when posts exist but are not analyzed (hasUnanalyzedPosts: true).',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
];

export async function runAgent(
  userId: string,
  userMessage: string,
  chatId: string // Now required!
): Promise<AgentResponse> {
  const supabase = createAdminClient();

  // Get user from DB
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (!user) {
    throw new Error('User not found');
  }

  // ✅ CRITICAL: Load conversation history
  const { data: previousMessages } = await supabase
    .from('messages')
    .select('role, content')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
    .limit(20); // Last 20 messages

  // Build messages array with history
  const messages: any[] = [
    {
      role: 'system',
      content: `You are an intelligent LinkedIn content agent. Your PRIMARY GOAL is to create content that sounds EXACTLY like the user.

## AUTHENTICITY REQUIREMENTS

Before generating ANY content, you MUST:
1. Call get_top_performing_posts to see real examples
2. Call get_viral_patterns to understand what works
3. Call get_user_profile to get voice analysis

When generating content:
1. Start by analyzing their top post hooks word-for-word
2. Match their sentence structure, not generic patterns
3. Use their vocabulary, not buzzwords
4. Apply ONLY patterns proven for them
5. If they don't use emojis, DON'T add emojis
6. If they write short posts, write short posts

## RED FLAGS (Never Generate)

❌ "In the ever-evolving world of..."
❌ "As a [role] passionate about..."
❌ "Key Takeaways:" sections with bullets
❌ Excessive emojis (unless user uses them)
❌ Generic "share your thoughts" CTAs
❌ Buzzword salad
❌ Posts that could be from anyone

## QUALITY CHECK

Before responding, ask yourself:
- Does this sound like the user's actual posts?
- Did I use their real hooks?
- Did I match their tone and style?
- Would someone recognize this as their writing?

If you answer "no" to any, start over.

## WHEN TO REFUSE

If you don't have:
- Voice analysis
- Example posts (minimum 3)
- Viral patterns

DO NOT generate generic content. Instead, explain what's missing and how to get it.

## HANDLING USER REFERENCES
When user says:
- "write variation 3" → Extract variation 3 from YOUR last response in the conversation history
- "the second one" → Extract the second item from YOUR last response
- "that post" → Reference the most recent post you generated
- "improve it" → Reference the most recent content
- "make it shorter" → Reference the last thing you showed and shorten it

## HANDLING TOOL FAILURES (CRITICAL!)

When a tool returns an error:
1. READ the diagnostics carefully (reason, suggestions, alternativeData)
2. Try alternative approaches:
   - If get_top_performing_posts fails with hasUnanalyzedPosts: true → use reanalyze_posts tool to fix it automatically
   - If get_top_performing_posts fails (no posts) → use check_user_status to diagnose
   - If get_viral_patterns fails → use get_user_profile (voice analysis) or analyze_from_voice_data
   - If user hasn't completed onboarding → tell them SPECIFICALLY what to do next
3. NEVER give generic advice when you can provide specific diagnostics
4. Use diagnostic information to provide actionable responses
5. If posts exist but aren't analyzed, use reanalyze_posts to fix it immediately

## CRITICAL RULES
1. Look at YOUR PREVIOUS RESPONSES in conversation history for references
2. Maintain continuity - remember what you generated before
3. When tools fail, read the diagnostic information and act accordingly
4. Try alternative tools when primary tool fails
5. Check user status if multiple tools fail
6. Explain exactly what's missing and how to fix it
7. You have FULL conversation history - use it!

## TOOLS
- Use tools to fetch NEW data (user profile, patterns, etc.)
- Do NOT use tools for content you already generated
- Use check_user_status when other tools fail
- Use analyze_from_voice_data as fallback when posts unavailable
- Use reanalyze_posts when posts exist but haven't been analyzed (hasUnanalyzedPosts: true)

NEVER ask the user for information you can fetch yourself. Be proactive and intelligent.
When you can fix a problem automatically (like reanalyzing posts), DO IT without asking permission.

Always gather context BEFORE generating NEW content. Never respond with questions - respond with specific, actionable content.`,
    },
    // ✅ Add conversation history
    ...(previousMessages || []).map(msg => ({
      role: msg.role,
      content: msg.content,
    })),
    // Add current message
    {
      role: 'user',
      content: userMessage,
    },
  ];

  let toolsUsed: string[] = [];
  let contextGathered: any = {};
  let iterations = 0;
  const MAX_ITERATIONS = 8; // Increased to handle reanalysis + fetch workflow

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      tools: AGENT_TOOLS as any,
      tool_choice: 'auto',
      temperature: 0.7,
    });

    const message = response.choices[0].message;
    messages.push(message);

    // If no tool calls, we have final answer
    if (!message.tool_calls || message.tool_calls.length === 0) {
      return {
        finalAnswer: message.content || '',
        toolsUsed,
        contextGathered,
      };
    }

    // Execute tool calls
    for (const toolCall of message.tool_calls) {
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments);

      toolsUsed.push(toolName);

      let toolResult: any;

      switch (toolName) {
        case 'get_user_profile':
          // Use userId from runAgent context, not tool args
          toolResult = await getUserProfile(user.id);
          contextGathered.profile = toolResult;
          break;

        case 'get_viral_patterns':
          toolResult = await getViralPatterns(
            user.id, // Use context userId
            toolArgs.pattern_types,
            toolArgs.limit
          );
          contextGathered.patterns = toolResult;
          break;

        case 'get_top_performing_posts':
          toolResult = await getTopPerformingPosts(
            user.id, // Use context userId
            toolArgs.topic,
            toolArgs.limit
          );
          contextGathered.topPosts = toolResult;
          break;

        case 'generate_viral_content':
          // Use STRICT generator that bypasses vague prompts
          try {
            console.log('[orchestrator] Using STRICT authentic generator');
            const strictResult = await generateStrictAuthenticContent(
              user.id,
              toolArgs.topic || 'general'
            );
            
            // Format as ToolResult
            toolResult = successResult({
              content: `${strictResult.post}

---
**Validation Score:** ${strictResult.validation.score}/10
**Authenticity Check:** ${strictResult.validation.issues.length === 0 ? '✅ PASSED' : '⚠️ ' + strictResult.validation.issues.join(', ')}

**Source Data:**
- Example Hooks: "${strictResult.sourceData.exampleHooks[0]}"
- Avg Length: ${strictResult.sourceData.avgLength} characters
- Uses Emojis: ${strictResult.sourceData.patterns.usesEmojis ? 'YES' : 'NO'}
- Uses Hashtags: ${strictResult.sourceData.patterns.usesHashtags ? 'YES' : 'NO'}
- Uses Bullets: ${strictResult.sourceData.patterns.usesBullets ? 'YES' : 'NO'}

*This post was generated using YOUR exact writing patterns, not generic templates.*`,
              validationScore: strictResult.validation.score,
              sourceData: strictResult.sourceData,
            });
          } catch (error) {
            console.error('[orchestrator] Strict generator failed:', error);
            toolResult = errorResult('Failed to generate authentic content', {
              reason: error instanceof Error ? error.message : 'Unknown error',
              suggestions: [
                'Ensure you have completed onboarding',
                'Check that posts were imported successfully',
                'Verify voice analysis exists',
              ],
            });
          }
          break;

        case 'get_previous_response':
          toolResult = await getPreviousResponse(
            chatId, // Use context chatId
            toolArgs.query
          );
          break;

        case 'check_user_status':
          toolResult = await checkUserStatus(user.id); // Use context userId
          break;

        case 'analyze_from_voice_data':
          toolResult = await analyzeFromVoiceData(user.id); // Use context userId
          break;

        case 'reanalyze_posts':
          toolResult = await reanalyzePosts(user.id); // Use context userId
          break;

        default:
          toolResult = errorResult('Unknown tool');
      }

      // ✅ Store result metadata
      contextGathered[toolName] = toolResult;

      // Pass result to agent
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult),
      });

      // ✅ Log tool failures for debugging
      if (!toolResult.success) {
        console.warn(`Tool ${toolName} failed:`, toolResult.error);
        console.warn('Diagnostics:', toolResult.diagnostics);
      }
    }
  }

  // Fallback if max iterations reached
  return {
    finalAnswer: 'I need more iterations to complete this task. Please try again.',
    toolsUsed,
    contextGathered,
  };
}

// Tool implementations

async function getUserProfile(userId: string): Promise<ToolResult> {
  try {
    const supabase = createAdminClient();

    // Check onboarding status first
    const { data: user } = await supabase
      .from('users')
      .select('onboarding_status, goals')
      .eq('id', userId)
      .single();

    if (!user) {
      return errorResult('User not found in database', {
        reason: 'User record missing',
        suggestions: ['Check if user completed signup'],
      });
    }

    if (user.onboarding_status !== 'completed') {
      return errorResult('User has not completed onboarding', {
        reason: `Onboarding status: ${user.onboarding_status}`,
        suggestions: [
          'User needs to complete onboarding first',
          'Redirect to onboarding flow',
        ],
        alternativeData: {
          onboardingStatus: user.onboarding_status,
          nextStep: getNextOnboardingStep(user.onboarding_status),
        },
      });
    }

    // Fetch all profile data
    const { data: profile } = await supabase
      .from('linkedin_profiles')
      .select('full_name, headline, about, followers_count')
      .eq('user_id', userId)
      .single();

    const { data: voiceAnalysis } = await supabase
      .from('voice_analysis')
      .select('overall_tone, writing_style, common_topics, strengths, analysis_summary')
      .eq('user_id', userId)
      .single();

    // Check if we have minimum required data
    if (!profile && !voiceAnalysis) {
      return errorResult('No profile data available', {
        reason: 'Profile and voice analysis are both missing',
        suggestions: [
          'User may need to re-run onboarding',
          'Check if LinkedIn data fetch failed',
        ],
      });
    }

    return successResult({
      profile: profile || { note: 'Profile data not available' },
      voice: voiceAnalysis || { note: 'Voice analysis not available' },
      goals: user.goals || [],
      dataCompleteness: {
        hasProfile: !!profile,
        hasVoiceAnalysis: !!voiceAnalysis,
        hasGoals: user.goals?.length > 0,
      },
    });
  } catch (error) {
    return errorResult('Database error while fetching profile', {
      reason: error instanceof Error ? error.message : 'Unknown error',
      suggestions: ['Check database connection', 'Verify user permissions'],
    });
  }
}

async function getViralPatterns(
  userId: string,
  patternTypes?: string[],
  limit = 5
): Promise<ToolResult> {
  try {
    const supabase = createAdminClient();

    // Check if patterns exist
    const { count: totalPatterns } = await supabase
      .from('viral_patterns')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (!totalPatterns || totalPatterns === 0) {
      // No patterns yet - fallback to voice analysis
      const { data: voiceAnalysis } = await supabase
        .from('voice_analysis')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (voiceAnalysis) {
        // Generate patterns from voice analysis on the fly
        return successResult({
          patterns: [
            {
              pattern_type: 'tone',
              pattern_description: `Use ${voiceAnalysis.overall_tone} tone`,
              success_rate: 100,
              source: 'voice_analysis',
            },
            {
              pattern_type: 'topic',
              pattern_description: `Focus on: ${voiceAnalysis.common_topics?.slice(0, 3).join(', ') || 'general topics'}`,
              success_rate: 100,
              source: 'voice_analysis',
            },
          ],
          fallbackUsed: true,
          note: 'Using voice analysis as patterns not yet extracted',
        });
      }

      return errorResult('No viral patterns or voice analysis available', {
        reason: 'User needs to complete post analysis to generate patterns',
        suggestions: [
          'Run pattern extraction from analyzed posts',
          'Complete onboarding to analyze posts',
        ],
        alternativeData: {
          hasVoiceAnalysis: false,
          needsAnalysis: true,
        },
      });
    }

    // Query patterns
    let query = supabase
      .from('viral_patterns')
      .select('pattern_type, pattern_description, success_rate')
      .eq('user_id', userId)
      .order('success_rate', { ascending: false });

    if (patternTypes && patternTypes.length > 0) {
      query = query.in('pattern_type', patternTypes);
    }

    const { data: patterns } = await query.limit(limit);

    return successResult({
      patterns: patterns || [],
      totalAvailable: totalPatterns,
      filtered: !!patternTypes,
    });
  } catch (error) {
    return errorResult('Error fetching patterns', {
      reason: error instanceof Error ? error.message : 'Unknown error',
      suggestions: ['Check database connection', 'Verify viral_patterns table exists'],
    });
  }
}

async function getTopPerformingPosts(
  userId: string,
  topic?: string,
  limit = 3
): Promise<ToolResult> {
  try {
    const supabase = createAdminClient();

    // First, check if user has ANY posts
    const { count: totalPosts } = await supabase
      .from('linkedin_posts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (!totalPosts || totalPosts === 0) {
      return errorResult('No posts found for this user', {
        reason: 'User has not imported any LinkedIn posts',
        suggestions: [
          'User needs to complete onboarding to import posts',
          'Or re-sync LinkedIn posts',
        ],
        alternativeData: {
          canAnalyze: false,
          needsOnboarding: true,
        },
      });
    }

    // Query posts (without JOIN to avoid issues)
    let postsQuery = supabase
      .from('linkedin_posts')
      .select('id, post_text, engagement_rate')
      .eq('user_id', userId)
      .not('engagement_rate', 'is', null)
      .order('engagement_rate', { ascending: false })
      .limit(limit);

    const { data: topPosts } = await postsQuery;

    if (!topPosts || topPosts.length === 0) {
      return errorResult(
        'No posts found with engagement data',
        {
          reason: `User has ${totalPosts} posts, but none have engagement metrics`,
          suggestions: ['Check if posts were scraped with engagement data'],
          alternativeData: {
            totalPosts,
          },
        }
      );
    }

    // Now fetch post analysis separately
    const postIds = topPosts.map(p => p.id);
    const { data: analyses } = await supabase
      .from('post_analysis')
      .select('post_id, tone, topics, what_worked, hook_analysis, engagement_analysis')
      .in('post_id', postIds);

    console.log('[getTopPerformingPosts] Found', analyses?.length || 0, 'analyzed posts out of', topPosts.length);

    // Check if we have any analyzed posts
    if (!analyses || analyses.length === 0) {
      return errorResult(
        'No analyzed posts available',
        {
          reason: `User has ${topPosts.length} posts, but none have been analyzed yet`,
          suggestions: ['Run post analysis', 'Check analysis completion'],
          alternativeData: {
            totalPosts,
            hasUnanalyzedPosts: true,
            topicRequested: topic,
          },
        }
      );
    }

    // Join posts with their analysis
    const postsWithAnalysis = topPosts
      .map(post => {
        const analysis = analyses.find(a => a.post_id === post.id);
        return analysis ? { ...post, post_analysis: analysis } : null;
      })
      .filter(p => p !== null);

    // Filter by topic if requested
    let filteredPosts = postsWithAnalysis;
    if (topic) {
      filteredPosts = postsWithAnalysis.filter(p => 
        p.post_analysis.topics?.some((t: string) => 
          t.toLowerCase().includes(topic.toLowerCase())
        )
      );

      if (filteredPosts.length === 0) {
        return errorResult(
          `No posts found about "${topic}"`,
          {
            reason: `User has ${postsWithAnalysis.length} analyzed posts, but none about "${topic}"`,
            suggestions: ['Try a different topic', 'Show available topics to user'],
            alternativeData: {
              totalAnalyzedPosts: postsWithAnalysis.length,
              topicRequested: topic,
            },
          }
        );
      }
    }

    // Format and return posts
    const formattedPosts = filteredPosts.map((p: any) => ({
      text: p.post_text,
      engagement: p.engagement_rate,
      hook: p.post_text.split('\n')[0],
      whatWorked: p.post_analysis?.what_worked,
      tone: p.post_analysis?.tone,
      topics: p.post_analysis?.topics,
    }));

    return successResult({
      posts: formattedPosts,
      totalFound: formattedPosts.length,
      totalPosts,
      filtered: !!topic,
    });
  } catch (error) {
    return errorResult('Error fetching posts', {
      reason: error instanceof Error ? error.message : 'Unknown error',
      suggestions: ['Check database connection', 'Verify post_analysis table exists'],
    });
  }
}

async function generateViralContent(
  userId: string,
  topic: string,
  tone: string | undefined,
  context: any
): Promise<ToolResult> {
  try {
    console.log('[generateViralContent] Context received:', Object.keys(context));
    
    // Extract data from ToolResult objects
    const profileData = context.profile?.success ? context.profile.data : null;
    const patternsData = context.patterns?.success ? context.patterns.data : null;
    const topPostsData = context.topPosts?.success ? context.topPosts.data : null;

    // Build context for validation
    const validationContext = {
      voice: profileData?.voice,
      topPosts: topPostsData,
      patterns: patternsData?.patterns || patternsData,
    };

    console.log('[generateViralContent] Validation context:', {
      hasVoice: !!validationContext.voice,
      topPostsCount: validationContext.topPosts?.length || 0,
      patternsCount: validationContext.patterns?.length || 0,
    });

    // ✅ CRITICAL: Validate we have REAL data
    const validation = validateGenerationContext(validationContext);
    
    if (!validation.valid) {
      return errorResult('Cannot generate authentic content without proper data', {
        reason: validation.errors.join(', '),
        suggestions: [
          'Ensure voice analysis is complete',
          'Need at least 3 example posts',
          'Need viral patterns data',
        ],
        alternativeData: {
          errors: validation.errors,
          warnings: validation.warnings,
        },
      });
    }

    if (validation.warnings.length > 0) {
      console.warn('[generateViralContent] Warnings:', validation.warnings);
    }

    const voice = validationContext.voice;
    const patterns = validationContext.patterns || [];
    const topPosts = validationContext.topPosts || [];

    // Extract REAL examples from user's top posts
    const realHooks = topPosts
      .map((p: any) => p.hook)
      .filter(Boolean)
      .slice(0, 3);

    const realPatterns = topPosts
      .map((p: any) => p.whatWorked)
      .filter(Boolean);

    // Get actual sentence structure from their posts
    const examplePost = topPosts[0]?.text || '';
    const sentences = examplePost.split(/[.!?]+/).filter(Boolean);
    const sentenceCount = sentences.length;
    const avgSentenceLength = sentenceCount > 0 ? Math.round(examplePost.length / sentenceCount) : 50;
    const usesEmojis = /[\u{1F300}-\u{1F9FF}]/u.test(examplePost);
    const usesHashtags = /#\w+/.test(examplePost);
    const lineBreaks = (examplePost.match(/\n/g) || []).length;

    const prompt = `Create a LinkedIn post that sounds EXACTLY like this user. Do NOT create generic LinkedIn content.

## USER'S ACTUAL VOICE (FROM THEIR TOP POSTS)

Real hooks they use:
${realHooks.map((h, i) => `${i + 1}. "${h}"`).join('\n')}

What actually worked for them:
${realPatterns.map((p, i) => `${i + 1}. ${p}`).join('\n')}

## THEIR WRITING DNA

Tone: ${voice.overall_tone}
Style: ${voice.writing_style}
Average sentence length: ${avgSentenceLength} characters
Uses emojis: ${usesEmojis ? 'YES' : 'NO'}
Uses hashtags: ${usesHashtags ? 'YES (sparingly)' : 'NO'}
Line breaks per post: ~${lineBreaks}

## EXAMPLE OF THEIR ACTUAL POST

"""
${examplePost}
"""

## PROVEN PATTERNS THEY USE

${patterns.slice(0, 5).map((p: any) => `- [${p.pattern_type}] ${p.pattern_description}`).join('\n')}

## YOUR TASK

Topic: ${topic}
${tone ? `Specific tone: ${tone}` : ''}

Create 3 variations that:
1. Use one of THEIR proven hooks (not generic hooks)
2. Match THEIR sentence structure and length
3. Use emojis/hashtags ONLY if they do
4. Sound like THEM, not like generic LinkedIn advice
5. Apply at least 2 of THEIR proven patterns

## CRITICAL RULES

❌ NO generic LinkedIn fluff like:
- "In the ever-evolving world of..."
- "As a [role] passionate about..."
- "Key Takeaways:" sections
- "Questions to Ponder:"
- Excessive emojis if they don't use them
- Bullet points if they don't use them

✅ YES authentic content:
- Starts like THEIR top posts
- Uses THEIR vocabulary and tone
- Matches THEIR formatting style
- Feels like THEM writing

## OUTPUT FORMAT

### Variation 1: [Describe hook type FROM THEIR POSTS]
[The actual post - must sound like them]

**Patterns used:** [from their proven patterns list]
**Why this works:** [based on their actual data, not generic advice]
**Engagement prediction:** X/10

[Repeat for variations 2 and 3]

### Recommendation
Which variation and why (based on their past performance data).

GO:`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert at mimicking writing styles. Your job is to write content that sounds EXACTLY like the user based on their actual posts.

CRITICAL: You will be penalized for generic content. Every element must be grounded in the user's actual data.`,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.9, // Higher for more authentic variation
      max_tokens: 2000,
    });

    let generatedContent = response.choices[0].message.content || '';

    // ✅ Check for generic phrases
    const genericPhrases = containsGenericPhrases(generatedContent);
    if (genericPhrases.length > 0) {
      console.warn('[generateViralContent] Generic phrases detected:', genericPhrases);
      
      return errorResult('Generated content contains generic phrases', {
        reason: `Found generic phrases: ${genericPhrases.join(', ')}`,
        suggestions: [
          'Content must match user\'s authentic style',
          'Regenerate without generic LinkedIn buzzwords',
        ],
        alternativeData: {
          genericPhrasesFound: genericPhrases,
        },
      });
    }

    // ✅ Quality check
    const qualityCheck = await validateContentQuality(
      generatedContent,
      topPosts.map((p: any) => p.text).slice(0, 3),
      voice
    );

    console.log('[generateViralContent] Quality score:', qualityCheck.score);

    if (!qualityCheck.passes) {
      console.warn('[generateViralContent] Failed quality check:', qualityCheck.issues);
      
      return errorResult('Generated content not authentic enough', {
        reason: `Quality score: ${qualityCheck.score}/10 - does not match user's style`,
        suggestions: [
          'Content must sound more like the user',
          'Review user data and regenerate with stricter adherence',
        ],
        alternativeData: {
          qualityScore: qualityCheck.score,
          issues: qualityCheck.issues,
        },
      });
    }

    // ✅ Add source attribution
    const finalContent = `${generatedContent}

---
**Data Used:**
- Voice Analysis: ${voice.overall_tone} tone, ${voice.writing_style} style
- Top Posts Analyzed: ${topPosts.length}
- Patterns Applied: ${patterns.slice(0, 3).map((p: any) => p.pattern_type).join(', ')}
- Example Hook: "${realHooks[0]}"

*This content was generated using YOUR actual data, not generic templates.*
*Quality Score: ${qualityCheck.score}/10*`;
    
    return successResult({
      content: finalContent,
      topic,
      tone,
      qualityScore: qualityCheck.score,
      contextsUsed: {
        hasProfile: !!profileData,
        hasVoice: !!voice,
        patternsCount: patterns.length,
        topPostsCount: topPosts.length,
      },
    });
  } catch (error) {
    console.error('[generateViralContent] Error:', error);
    return errorResult('Error generating viral content', {
      reason: error instanceof Error ? error.message : 'Unknown error',
      suggestions: ['Check OpenAI API key', 'Try again with different parameters'],
    });
  }
}

async function getPreviousResponse(chatId: string, query: string): Promise<ToolResult> {
  try {
    const supabase = createAdminClient();

    const { data: lastAssistantMessage } = await supabase
      .from('messages')
      .select('content')
      .eq('chat_id', chatId)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!lastAssistantMessage) {
      return errorResult('No previous response found in this chat', {
        reason: 'Chat has no assistant messages yet',
        suggestions: ['This is the first message in the conversation'],
      });
    }

    return successResult({
      previousResponse: lastAssistantMessage.content,
      query,
      note: 'Conversation history is already included in the messages array, so you can also reference it directly.',
    });
  } catch (error) {
    return errorResult('Error fetching previous response', {
      reason: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// Step 3: Add diagnostic tool
async function checkUserStatus(userId: string): Promise<ToolResult> {
  try {
    const supabase = createAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('onboarding_status, goals, created_at')
      .eq('id', userId)
      .single();

    const { count: postsCount } = await supabase
      .from('linkedin_posts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    const { count: patternsCount } = await supabase
      .from('viral_patterns')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    const { data: voiceAnalysis } = await supabase
      .from('voice_analysis')
      .select('id')
      .eq('user_id', userId)
      .single();

    const status = {
      onboardingComplete: user?.onboarding_status === 'completed',
      onboardingStatus: user?.onboarding_status,
      hasPosts: (postsCount || 0) > 0,
      postsCount: postsCount || 0,
      hasPatterns: (patternsCount || 0) > 0,
      patternsCount: patternsCount || 0,
      hasVoiceAnalysis: !!voiceAnalysis,
      accountAge: user?.created_at,
    };

    const recommendations: string[] = [];

    if (!status.onboardingComplete) {
      recommendations.push(`Complete onboarding (current status: ${status.onboardingStatus})`);
    }

    if (!status.hasPosts) {
      recommendations.push('Import LinkedIn posts to enable analysis');
    }

    if (!status.hasVoiceAnalysis) {
      recommendations.push('Run voice analysis on imported posts');
    }

    if (!status.hasPatterns) {
      recommendations.push('Extract viral patterns from top posts');
    }

    return successResult({
      ...status,
      canGenerateContent: status.hasVoiceAnalysis || status.hasPatterns,
      canAnalyzePosts: status.hasPosts,
      recommendations,
    });
  } catch (error) {
    return errorResult('Error checking user status', {
      reason: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// Step 6: Add alternative analysis route
async function analyzeFromVoiceData(userId: string): Promise<ToolResult> {
  try {
    const supabase = createAdminClient();

    const { data: voiceAnalysis } = await supabase
      .from('voice_analysis')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!voiceAnalysis) {
      return errorResult('No analysis data available', {
        reason: 'User has not completed voice analysis',
        suggestions: ['Complete onboarding', 'Run post analysis'],
      });
    }

    // Generate insights from voice analysis
    const insights = {
      topTopics: voiceAnalysis.common_topics?.slice(0, 5) || [],
      writingStyle: voiceAnalysis.writing_style,
      strengths: voiceAnalysis.strengths || [],
      recommendations: voiceAnalysis.recommendations || [],
      summary: voiceAnalysis.analysis_summary,
    };

    return successResult({
      source: 'voice_analysis',
      insights,
      note: 'Based on your writing style analysis',
    });
  } catch (error) {
    return errorResult('Error analyzing voice data', {
      reason: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function reanalyzePosts(userId: string): Promise<ToolResult> {
  try {
    console.log('[reanalyzePosts] Starting post analysis check for user:', userId);
    
    const supabase = createAdminClient();

    // Get all posts
    const { data: posts } = await supabase
      .from('linkedin_posts')
      .select('*')
      .eq('user_id', userId)
      .order('posted_at', { ascending: false });

    if (!posts || posts.length === 0) {
      return errorResult('No posts found to analyze', {
        reason: 'User has no imported LinkedIn posts',
        suggestions: ['Import LinkedIn posts first', 'Check if profile URL was correct'],
      });
    }

    console.log('[reanalyzePosts] Found', posts.length, 'posts total');

    // Check which posts already have analysis
    const postIds = posts.map(p => p.id);
    const { data: existingAnalyses } = await supabase
      .from('post_analysis')
      .select('post_id')
      .in('post_id', postIds);

    const analyzedPostIds = new Set(existingAnalyses?.map(a => a.post_id) || []);
    
    // Filter to only posts that need analysis
    const postsToAnalyze = posts.filter(p => !analyzedPostIds.has(p.id));

    console.log('[reanalyzePosts] Already analyzed:', analyzedPostIds.size);
    console.log('[reanalyzePosts] Need to analyze:', postsToAnalyze.length);

    if (postsToAnalyze.length === 0) {
      return successResult({
        message: 'All posts are already analyzed',
        totalPosts: posts.length,
        alreadyAnalyzed: analyzedPostIds.size,
        newlyAnalyzed: 0,
      });
    }

    // Analyze only posts that need analysis
    for (const post of postsToAnalyze) {
      const analysisPrompt = `Analyze this LinkedIn post and provide detailed insights:

Post Text: ${post.post_text}
Likes: ${post.likes_count}
Comments: ${post.comments_count}
Shares: ${post.shares_count}
Engagement Rate: ${post.engagement_rate}%

Provide analysis in the following JSON format:
{
  "tone": "professional/casual/inspirational/educational/etc",
  "topics": ["topic1", "topic2", "topic3"],
  "hook_analysis": "Analysis of the opening hook and its effectiveness",
  "engagement_analysis": "Why this post did or didn't perform well",
  "what_worked": "Specific elements that contributed to success",
  "what_didnt_work": "Areas for improvement"
}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert LinkedIn content analyst. Provide detailed, actionable insights in JSON format.',
          },
          {
            role: 'user',
            content: analysisPrompt,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const analysis = JSON.parse(response.choices[0].message.content || '{}');

      console.log('[reanalyzePosts] Analyzed post:', post.id, 'Tone:', analysis.tone);

      // Extract time from post.posted_at if available
      let postingTime = null;
      if (post.posted_at) {
        try {
          const date = new Date(post.posted_at);
          postingTime = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        } catch (e) {
          console.log('[reanalyzePosts] Could not extract time from posted_at');
        }
      }

      // Upsert post analysis (in case it already exists)
      const { data: insertedData, error: insertError } = await supabase
        .from('post_analysis')
        .upsert({
          user_id: userId,
          post_id: post.id,
          tone: analysis.tone,
          topics: analysis.topics || [],
          hook_analysis: analysis.hook_analysis,
          engagement_analysis: analysis.engagement_analysis,
          what_worked: analysis.what_worked,
          what_didnt_work: analysis.what_didnt_work,
          posting_time: postingTime,
          analysis_status: 'completed',
          raw_analysis: analysis,
        }, {
          onConflict: 'post_id',
        });

      if (insertError) {
        console.error('[reanalyzePosts] Error inserting analysis for post', post.id, ':', insertError);
        throw insertError;
      }

      console.log('[reanalyzePosts] Successfully saved analysis for post:', post.id);
    }

    console.log('[reanalyzePosts] Completed analysis for new posts');

    return successResult({
      totalPosts: posts.length,
      alreadyAnalyzed: analyzedPostIds.size,
      newlyAnalyzed: postsToAnalyze.length,
      message: `Analyzed ${postsToAnalyze.length} new posts. ${analyzedPostIds.size} were already analyzed.`,
    });
  } catch (error) {
    console.error('[reanalyzePosts] Error:', error);
    return errorResult('Error analyzing posts', {
      reason: error instanceof Error ? error.message : 'Unknown error',
      suggestions: ['Check OpenAI API key', 'Verify database connection', 'Try again'],
    });
  }
}

// Streaming version of agent for real-time responses
export async function runAgentStreaming(
  userId: string,
  userMessage: string,
  chatId: string,
  onChunk: (text: string) => void
): Promise<void> {
  const supabase = createAdminClient();

  // Get user from DB
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (!user) {
    throw new Error('User not found');
  }

  // Load conversation history
  const { data: previousMessages } = await supabase
    .from('messages')
    .select('role, content')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
    .limit(20);

  // First, gather context using agent tools (non-streaming)
  const messages: any[] = [
    {
      role: 'system',
      content: `You are an intelligent LinkedIn content agent with conversation memory. Gather necessary context using tools, then generate content. Remember previous responses in the conversation.`,
    },
    ...(previousMessages || []).map(msg => ({
      role: msg.role,
      content: msg.content,
    })),
    {
      role: 'user',
      content: userMessage,
    },
  ];

  let contextGathered: any = {};
  let iterations = 0;
  const MAX_ITERATIONS = 3;

  // Gather context phase (non-streaming)
  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      tools: AGENT_TOOLS as any,
      tool_choice: 'auto',
      temperature: 0.7,
    });

    const message = response.choices[0].message;
    messages.push(message);

    // If no tool calls, break and start streaming
    if (!message.tool_calls || message.tool_calls.length === 0) {
      break;
    }

    // Execute tool calls to gather context
    for (const toolCall of message.tool_calls) {
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments);

      let toolResult: any;

      switch (toolName) {
        case 'get_user_profile':
          toolResult = await getUserProfile(toolArgs.user_id);
          contextGathered.profile = toolResult;
          break;

        case 'get_viral_patterns':
          toolResult = await getViralPatterns(
            toolArgs.user_id,
            toolArgs.pattern_types,
            toolArgs.limit
          );
          contextGathered.patterns = toolResult;
          break;

        case 'get_top_performing_posts':
          toolResult = await getTopPerformingPosts(
            toolArgs.user_id,
            toolArgs.topic,
            toolArgs.limit
          );
          contextGathered.topPosts = toolResult;
          break;

        default:
          toolResult = { error: 'Unknown tool' };
      }

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult),
      });
    }
  }

  // Now stream the final generation
  messages.push({
    role: 'user',
    content: `Now generate the content using the gathered context. Stream your response.`,
  });

  const stream = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    stream: true,
    temperature: 0.8,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    if (content) {
      onChunk(content);
    }
  }
}

