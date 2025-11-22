# 14-ROBUST-TOOL-DESIGN.md - Bulletproof Agent Tools

## Problem
When tools fail or return empty data, agent gives up and provides generic advice instead of trying alternatives or providing diagnostic info.

---

## Step 1: Create Robust Tool Response Type

Create `lib/agent/types.ts`:

```typescript
export interface ToolResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  fallback?: any;
  diagnostics?: {
    reason?: string;
    suggestions?: string[];
    alternativeData?: any;
  };
}

export function successResult<T>(data: T): ToolResult<T> {
  return { success: true, data };
}

export function errorResult(
  error: string,
  diagnostics?: ToolResult['diagnostics']
): ToolResult {
  return { success: false, error, diagnostics };
}
```

---

## Step 2: Rewrite Tools with Robustness

Update `lib/agent/orchestrator.ts` tool implementations:

```typescript
import { successResult, errorResult, ToolResult } from './types';

async function getUserProfile(userId: string): Promise<ToolResult> {
  try {
    const supabase = await createClient();

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

async function getTopPerformingPosts(
  userId: string,
  topic?: string,
  limit = 3
): Promise<ToolResult> {
  try {
    const supabase = await createClient();

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

    // Query posts with filters
    let query = supabase
      .from('linkedin_posts')
      .select('id, post_text, engagement_rate, post_analysis(tone, what_worked, hook_analysis)')
      .eq('user_id', userId)
      .not('engagement_rate', 'is', null)
      .order('engagement_rate', { ascending: false });

    if (topic) {
      // Filter by topic if provided
      query = query.contains('post_analysis.topics', [topic]);
    }

    const { data: topPosts } = await query.limit(limit);

    if (!topPosts || topPosts.length === 0) {
      // User has posts, but none match criteria
      return errorResult(
        topic
          ? `No posts found about "${topic}"`
          : 'No analyzed posts available',
        {
          reason: topic
            ? `User has ${totalPosts} posts, but none about "${topic}"`
            : `User has ${totalPosts} posts, but none have been analyzed yet`,
          suggestions: topic
            ? ['Try a different topic', 'Show available topics to user']
            : ['Run post analysis', 'Check analysis completion'],
          alternativeData: {
            totalPosts,
            hasUnanalyzedPosts: true,
            topicRequested: topic,
          },
        }
      );
    }

    // Format and return posts
    const formattedPosts = topPosts.map(p => ({
      text: p.post_text,
      engagement: p.engagement_rate,
      hook: p.post_text.split('\n')[0],
      whatWorked: p.post_analysis?.what_worked,
      tone: p.post_analysis?.tone,
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

async function getViralPatterns(
  userId: string,
  patternTypes?: string[],
  limit = 5
): Promise<ToolResult> {
  try {
    const supabase = await createClient();

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
              pattern_description: `Focus on: ${voiceAnalysis.common_topics.slice(0, 3).join(', ')}`,
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
    });
  }
}
```

---

## Step 3: Add Diagnostic Tool

Add a new tool for checking user status:

```typescript
// Add to AGENT_TOOLS array:
{
  type: 'function',
  function: {
    name: 'check_user_status',
    description: 'Check user onboarding and data availability. Use this when other tools fail.',
    parameters: {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
      },
      required: ['user_id'],
    },
  },
}

// Implementation:
async function checkUserStatus(userId: string): Promise<ToolResult> {
  const supabase = await createClient();

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
}
```

---

## Step 4: Update System Prompt for Fallback Handling

```typescript
const systemPrompt = `You are an intelligent LinkedIn content agent.

## HANDLING TOOL FAILURES

When a tool returns an error:
1. READ the diagnostics (reason, suggestions, alternativeData)
2. Try alternative approaches:
   - If get_top_performing_posts fails → use check_user_status
   - If get_viral_patterns fails → use get_user_profile (voice analysis)
   - If user hasn't completed onboarding → tell them specifically what to do
3. NEVER give generic advice when you can provide specific diagnostics

## EXAMPLES

Bad Response:
Tool: get_top_performing_posts → error
You: "Here's how to analyze LinkedIn posts in general..."

Good Response:
Tool: get_top_performing_posts → error (no posts imported)
You: "I don't see any posts in your account yet. You need to complete onboarding first. Would you like me to guide you through importing your LinkedIn posts?"

Good Response:
Tool: get_top_performing_posts → error (no posts match topic)
You: "You have 25 posts, but none about 'AI ethics'. Your top topics are: leadership (8 posts), productivity (12 posts), remote work (5 posts). Would you like to write about one of these instead?"

## CRITICAL
- Use diagnostic information to provide specific, actionable responses
- Try alternative tools when primary tool fails
- Check user status if multiple tools fail
- Explain exactly what's missing and how to fix it`;
```

---

## Step 5: Update Tool Call Handler

```typescript
// In runAgent function:

for (const toolCall of message.tool_calls) {
  const toolName = toolCall.function.name;
  const toolArgs = JSON.parse(toolCall.function.arguments);

  toolsUsed.push(toolName);

  let toolResult: ToolResult;

  switch (toolName) {
    case 'get_user_profile':
      toolResult = await getUserProfile(toolArgs.user_id);
      break;

    case 'get_viral_patterns':
      toolResult = await getViralPatterns(
        toolArgs.user_id,
        toolArgs.pattern_types,
        toolArgs.limit
      );
      break;

    case 'get_top_performing_posts':
      toolResult = await getTopPerformingPosts(
        toolArgs.user_id,
        toolArgs.topic,
        toolArgs.limit
      );
      break;

    case 'check_user_status':
      toolResult = await checkUserStatus(toolArgs.user_id);
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
```

---

## Step 6: Add Alternative Analysis Route

When posts aren't available, provide alternative insights:

```typescript
async function analyzeFromVoiceData(userId: string): Promise<ToolResult> {
  const supabase = await createClient();

  const { data: voiceAnalysis } = await supabase
    .from('voice_analysis')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!voiceAnalysis) {
    return errorResult('No analysis data available');
  }

  // Generate insights from voice analysis
  const insights = {
    topTopics: voiceAnalysis.common_topics.slice(0, 5),
    writingStyle: voiceAnalysis.writing_style,
    strengths: voiceAnalysis.strengths,
    recommendations: voiceAnalysis.recommendations,
    summary: voiceAnalysis.analysis_summary,
  };

  return successResult({
    source: 'voice_analysis',
    insights,
    note: 'Based on your writing style analysis',
  });
}
```

---

## Expected Behavior After Fix

### Scenario 1: No Posts
```
User: "analyze my posts"

Agent:
- Calls get_top_performing_posts()
- Gets error: "No posts found"
- Reads diagnostics: needsOnboarding = true
- Calls check_user_status()
- Gets: onboardingStatus = "posts_fetched"

Response: "I see you've connected your LinkedIn profile but haven't imported posts yet. To analyze what's working, I need to import your recent posts. Would you like me to guide you through completing this step?"
```

### Scenario 2: Posts Exist, Analysis Pending
```
User: "analyze my posts"

Agent:
- Calls get_top_performing_posts()
- Gets error: "User has 25 posts, none analyzed"
- Tries alternative: check_user_status()
- Sees: postsCount=25, hasVoiceAnalysis=true

Response: "I see you have 25 posts, but they haven't been analyzed yet. However, I can tell you about your overall writing style: [voice analysis insights]. Would you like me to run a full analysis on your posts?"
```

### Scenario 3: Posts Analyzed Successfully
```
User: "analyze my posts"

Agent:
- Calls get_top_performing_posts()
- Success! Gets top 3 posts with analysis

Response: "Based on your top-performing posts:

📈 What's Working:
- Leadership topics get 12% avg engagement (best)
- Posts starting with questions get 2x more comments
- Personal stories outperform by 40%

Your top post (18% engagement): [hook]
Pattern: Started with contrarian take + ended with question

Would you like me to create more content using these patterns?"
```

---

## Testing Checklist

Test these scenarios:

```typescript
// ✅ Test 1: User with complete data
// ✅ Test 2: User mid-onboarding
// ✅ Test 3: User with posts but no analysis
// ✅ Test 4: User requesting analysis on non-existent topic
// ✅ Test 5: Database connection failure
```

---

## Key Improvements

1. **Tools return structured results** with success/error status
2. **Diagnostic information** tells agent WHY tool failed
3. **Alternative data sources** provided when primary fails
4. **Agent tries fallbacks** instead of giving up
5. **Specific, actionable responses** instead of generic advice

This makes your agent truly robust and intelligent.