# 02-BACKEND-API.md - Backend API Routes

## API Route Structure Overview

```
app/api/
├── chat/
│   └── route.ts                    # Main chat endpoint with streaming
├── onboarding/
│   ├── linkedin-profile/
│   │   └── route.ts               # Fetch LinkedIn profile
│   ├── linkedin-posts/
│   │   └── route.ts               # Fetch LinkedIn posts
│   ├── analyze-posts/
│   │   └── route.ts               # Analyze posts and create voice profile
│   └── goals/
│       └── route.ts               # Save user goals
├── context/
│   ├── summarize/
│   │   └── route.ts               # Auto-summarize context
│   └── batch/
│       └── route.ts               # Batch summarization after 5 messages
└── analysis/
    └── route.ts                   # Get user analysis data
```

## Step 1: Create Chat API Route

Create `app/api/chat/route.ts`:

```typescript
import { auth } from '@clerk/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { OpenAIStream, StreamingTextResponse } from 'ai';
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';
import { getContextForChat, shouldSummarizeContext } from '@/lib/context/manager';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export const runtime = 'edge';

interface ChatRequest {
  message: string;
  chatId?: string;
  chatType?: 'standard' | 'new_perspective';
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { message, chatId, chatType = 'standard' }: ChatRequest = await req.json();

    if (!message || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const supabase = await createClient();

    // Get user from database
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_user_id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    let currentChatId = chatId;

    // Create new chat if no chatId provided
    if (!currentChatId) {
      const { data: newChat, error: chatError } = await supabase
        .from('chats')
        .insert({
          user_id: user.id,
          title: message.substring(0, 50),
          chat_type: chatType,
        })
        .select()
        .single();

      if (chatError || !newChat) {
        return NextResponse.json({ error: 'Failed to create chat' }, { status: 500 });
      }

      currentChatId = newChat.id;
    }

    // Get context based on chat type
    const context = await getContextForChat(user.id, currentChatId, chatType);

    // Save user message
    const { error: messageError } = await supabase
      .from('messages')
      .insert({
        chat_id: currentChatId,
        user_id: user.id,
        role: 'user',
        content: message,
        token_count: Math.ceil(message.length / 4), // Rough estimate
      });

    if (messageError) {
      return NextResponse.json({ error: 'Failed to save message' }, { status: 500 });
    }

    // Update chat message count
    const { data: chat } = await supabase
      .from('chats')
      .select('message_count')
      .eq('id', currentChatId)
      .single();

    const newMessageCount = (chat?.message_count || 0) + 1;

    await supabase
      .from('chats')
      .update({
        message_count: newMessageCount,
        last_message_at: new Date().toISOString(),
      })
      .eq('id', currentChatId);

    // Check if we need to batch summarize (every 5 user messages)
    if (newMessageCount % 10 === 0) {
      // Trigger batch summarization asynchronously
      fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/context/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: currentChatId, userId: user.id }),
      }).catch(console.error);
    }

    // Prepare messages for OpenAI
    const messages = [
      {
        role: 'system' as const,
        content: context.systemPrompt,
      },
      ...context.conversationHistory.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      {
        role: 'user' as const,
        content: message,
      },
    ];

    // Check if context needs summarization (approaching 200k tokens)
    if (await shouldSummarizeContext(currentChatId)) {
      fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/context/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: currentChatId, userId: user.id }),
      }).catch(console.error);
    }

    // Stream response from OpenAI
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 2000,
    });

    const stream = OpenAIStream(response, {
      async onCompletion(completion) {
        // Save assistant message
        await supabase
          .from('messages')
          .insert({
            chat_id: currentChatId,
            user_id: user.id,
            role: 'assistant',
            content: completion,
            token_count: Math.ceil(completion.length / 4),
          });

        // Update total tokens
        const totalTokens = Math.ceil((message.length + completion.length) / 4);
        await supabase
          .from('chats')
          .update({
            total_tokens: supabase.rpc('increment', { x: totalTokens }),
          })
          .eq('id', currentChatId);
      },
    });

    return new StreamingTextResponse(stream, {
      headers: {
        'X-Chat-Id': currentChatId,
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

## Step 2: Create LinkedIn Profile API Route

Create `app/api/onboarding/linkedin-profile/route.ts`:

```typescript
import { auth } from '@clerk/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const { userId } = auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { profileUrl }: { profileUrl: string } = await req.json();

    if (!profileUrl) {
      return NextResponse.json({ error: 'Profile URL is required' }, { status: 400 });
    }

    const supabase = await createClient();

    // Get user from database
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_user_id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Call Apify LinkedIn Profile API
    const apifyResponse = await fetch(
      `https://api.apify.com/v2/acts/apimaestro~linkedin-profile-detail/run-sync-get-dataset-items?token=${process.env.APIFY_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileUrls: [profileUrl],
        }),
      }
    );

    if (!apifyResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch LinkedIn profile' },
        { status: 500 }
      );
    }

    const profileData = await apifyResponse.json();

    if (!profileData || profileData.length === 0) {
      return NextResponse.json(
        { error: 'No profile data found' },
        { status: 404 }
      );
    }

    const profile = profileData[0];

    // Save profile to database
    const { data: savedProfile, error: profileError } = await supabase
      .from('linkedin_profiles')
      .upsert({
        user_id: user.id,
        profile_url: profileUrl,
        full_name: profile.fullName || null,
        headline: profile.headline || null,
        about: profile.about || null,
        location: profile.location || null,
        followers_count: profile.followersCount || 0,
        connections_count: profile.connectionsCount || 0,
        profile_image_url: profile.profilePicture || null,
        raw_data: profile,
      })
      .select()
      .single();

    if (profileError) {
      return NextResponse.json(
        { error: 'Failed to save profile' },
        { status: 500 }
      );
    }

    // Update user onboarding status
    await supabase
      .from('users')
      .update({
        linkedin_profile_url: profileUrl,
        onboarding_status: 'profile_fetched',
      })
      .eq('id', user.id);

    return NextResponse.json({
      success: true,
      profile: savedProfile,
    });
  } catch (error) {
    console.error('LinkedIn profile fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

## Step 3: Create LinkedIn Posts API Route

Create `app/api/onboarding/linkedin-posts/route.ts`:

```typescript
import { auth } from '@clerk/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateEmbedding } from '@/lib/openai/embeddings';

export async function POST(req: NextRequest) {
  try {
    const { userId } = auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { profileUrl }: { profileUrl: string } = await req.json();

    if (!profileUrl) {
      return NextResponse.json({ error: 'Profile URL is required' }, { status: 400 });
    }

    const supabase = await createClient();

    // Get user from database
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_user_id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Call Apify LinkedIn Posts API
    const apifyResponse = await fetch(
      `https://api.apify.com/v2/acts/supreme_coder~linkedin-post/run-sync-get-dataset-items?token=${process.env.APIFY_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileUrl: profileUrl,
          maxPosts: 50, // Fetch last 50 posts
        }),
      }
    );

    if (!apifyResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch LinkedIn posts' },
        { status: 500 }
      );
    }

    const postsData = await apifyResponse.json();

    if (!postsData || postsData.length === 0) {
      return NextResponse.json(
        { error: 'No posts found' },
        { status: 404 }
      );
    }

    // Process and save posts with embeddings
    const savedPosts = [];
    
    for (const post of postsData) {
      const postText = post.text || post.content || '';
      
      // Generate embedding for post text
      const embedding = await generateEmbedding(postText);

      // Calculate engagement rate
      const totalEngagement = 
        (post.likes || 0) + 
        (post.comments || 0) + 
        (post.shares || 0);
      
      const engagementRate = totalEngagement > 0 
        ? ((totalEngagement / (post.impressions || 1)) * 100).toFixed(2)
        : null;

      const { data: savedPost, error: postError } = await supabase
        .from('linkedin_posts')
        .insert({
          user_id: user.id,
          post_url: post.url || post.postUrl,
          post_text: postText,
          posted_at: post.postedAt || post.timestamp,
          likes_count: post.likes || 0,
          comments_count: post.comments || 0,
          shares_count: post.shares || 0,
          engagement_rate: engagementRate,
          raw_data: post,
          embedding,
        })
        .select()
        .single();

      if (!postError && savedPost) {
        savedPosts.push(savedPost);
      }
    }

    // Update user onboarding status
    await supabase
      .from('users')
      .update({
        onboarding_status: 'posts_fetched',
      })
      .eq('id', user.id);

    return NextResponse.json({
      success: true,
      postsCount: savedPosts.length,
    });
  } catch (error) {
    console.error('LinkedIn posts fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

## Step 4: Create Analyze Posts API Route

Create `app/api/onboarding/analyze-posts/route.ts`:

```typescript
import { auth } from '@clerk/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();

    // Get user from database
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_user_id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get all posts for the user
    const { data: posts, error: postsError } = await supabase
      .from('linkedin_posts')
      .select('*')
      .eq('user_id', user.id)
      .order('posted_at', { ascending: false });

    if (postsError || !posts || posts.length === 0) {
      return NextResponse.json(
        { error: 'No posts found to analyze' },
        { status: 404 }
      );
    }

    // Analyze each post individually
    for (const post of posts) {
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
  "what_didnt_work": "Areas for improvement",
  "posting_time": "HH:MM format of when posted"
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

      // Save post analysis
      await supabase
        .from('post_analysis')
        .insert({
          user_id: user.id,
          post_id: post.id,
          tone: analysis.tone,
          topics: analysis.topics || [],
          hook_analysis: analysis.hook_analysis,
          engagement_analysis: analysis.engagement_analysis,
          what_worked: analysis.what_worked,
          what_didnt_work: analysis.what_didnt_work,
          posting_time: analysis.posting_time,
          analysis_status: 'completed',
          raw_analysis: analysis,
        });
    }

    // Generate overall voice analysis
    const voiceAnalysisPrompt = `Based on these ${posts.length} LinkedIn posts, create a comprehensive voice and style profile:

${posts.slice(0, 20).map((p, i) => `Post ${i + 1}: ${p.post_text}\nEngagement: ${p.engagement_rate}%\n`).join('\n')}

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

    const voiceResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert LinkedIn content strategist. Create a detailed voice profile.',
        },
        {
          role: 'user',
          content: voiceAnalysisPrompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const voiceAnalysis = JSON.parse(voiceResponse.choices[0].message.content || '{}');

    // Save voice analysis
    await supabase
      .from('voice_analysis')
      .upsert({
        user_id: user.id,
        overall_tone: voiceAnalysis.overall_tone,
        writing_style: voiceAnalysis.writing_style,
        common_topics: voiceAnalysis.common_topics || [],
        posting_patterns: voiceAnalysis.posting_patterns,
        engagement_patterns: voiceAnalysis.engagement_patterns,
        strengths: voiceAnalysis.strengths || [],
        weaknesses: voiceAnalysis.weaknesses || [],
        top_performing_elements: voiceAnalysis.top_performing_elements || [],
        recommendations: voiceAnalysis.recommendations || [],
        analysis_summary: voiceAnalysis.analysis_summary,
      });

    // Update user onboarding status
    await supabase
      .from('users')
      .update({
        onboarding_status: 'analyzed',
      })
      .eq('id', user.id);

    return NextResponse.json({
      success: true,
      postsAnalyzed: posts.length,
    });
  } catch (error) {
    console.error('Post analysis error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

## Step 5: Create Goals API Route

Create `app/api/onboarding/goals/route.ts`:

```typescript
import { auth } from '@clerk/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const { userId } = auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { goals }: { goals: string[] } = await req.json();

    if (!goals || !Array.isArray(goals)) {
      return NextResponse.json({ error: 'Goals must be an array' }, { status: 400 });
    }

    const supabase = await createClient();

    // Get user from database
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_user_id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Update user goals and complete onboarding
    const { error: updateError } = await supabase
      .from('users')
      .update({
        goals,
        onboarding_status: 'completed',
      })
      .eq('id', user.id);

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to save goals' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('Goals save error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

## Step 6: Create Analysis API Route

Create `app/api/analysis/route.ts`:

```typescript
import { auth } from '@clerk/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const { userId } = auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();

    // Get user from database
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_user_id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get voice analysis
    const { data: voiceAnalysis } = await supabase
      .from('voice_analysis')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Get top performing posts
    const { data: topPosts } = await supabase
      .from('linkedin_posts')
      .select('*, post_analysis(*)')
      .eq('user_id', user.id)
      .order('engagement_rate', { ascending: false })
      .limit(5);

    // Get posting patterns
    const { data: allPosts } = await supabase
      .from('linkedin_posts')
      .select('posted_at, engagement_rate')
      .eq('user_id', user.id);

    return NextResponse.json({
      voiceAnalysis,
      topPosts,
      postingStats: {
        totalPosts: allPosts?.length || 0,
        averageEngagement: allPosts
          ? (allPosts.reduce((sum, p) => sum + (p.engagement_rate || 0), 0) / allPosts.length).toFixed(2)
          : 0,
      },
    });
  } catch (error) {
    console.error('Analysis fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

## Next Steps

Proceed to `03-APIFY-INTEGRATION.md` for detailed Apify integration setup.