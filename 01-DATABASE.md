# 01-DATABASE.md - Supabase Database Schema

## Step 1: Enable pgvector Extension

In Supabase SQL Editor, run:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

## Step 2: Create Enums

```sql
-- User onboarding status
CREATE TYPE onboarding_status AS ENUM ('pending', 'profile_fetched', 'posts_fetched', 'analyzed', 'completed');

-- Chat types
CREATE TYPE chat_type AS ENUM ('standard', 'new_perspective');

-- Message roles
CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system');

-- Analysis status
CREATE TYPE analysis_status AS ENUM ('pending', 'processing', 'completed', 'failed');
```

## Step 3: Create Users Table

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    linkedin_profile_url TEXT,
    onboarding_status onboarding_status DEFAULT 'pending',
    goals JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_clerk_id ON users(clerk_user_id);
CREATE INDEX idx_users_onboarding_status ON users(onboarding_status);
```

## Step 4: Create LinkedIn Profile Table

```sql
CREATE TABLE linkedin_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    profile_url TEXT NOT NULL,
    full_name TEXT,
    headline TEXT,
    about TEXT,
    location TEXT,
    followers_count INTEGER,
    connections_count INTEGER,
    profile_image_url TEXT,
    raw_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_linkedin_profiles_user_id ON linkedin_profiles(user_id);
CREATE UNIQUE INDEX idx_linkedin_profiles_user_id_unique ON linkedin_profiles(user_id);
```

## Step 5: Create LinkedIn Posts Table

```sql
CREATE TABLE linkedin_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_url TEXT NOT NULL,
    post_text TEXT,
    posted_at TIMESTAMPTZ,
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    shares_count INTEGER DEFAULT 0,
    engagement_rate DECIMAL(5,2),
    raw_data JSONB,
    embedding vector(1536),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_linkedin_posts_user_id ON linkedin_posts(user_id);
CREATE INDEX idx_linkedin_posts_posted_at ON linkedin_posts(posted_at DESC);
CREATE INDEX idx_linkedin_posts_engagement ON linkedin_posts(engagement_rate DESC NULLS LAST);
CREATE INDEX idx_linkedin_posts_embedding ON linkedin_posts USING ivfflat (embedding vector_cosine_ops);
```

## Step 6: Create Post Analysis Table

```sql
CREATE TABLE post_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES linkedin_posts(id) ON DELETE CASCADE,
    tone TEXT,
    topics TEXT[],
    hook_analysis TEXT,
    engagement_analysis TEXT,
    what_worked TEXT,
    what_didnt_work TEXT,
    posting_time TIME,
    analysis_status analysis_status DEFAULT 'pending',
    raw_analysis JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_post_analysis_user_id ON post_analysis(user_id);
CREATE INDEX idx_post_analysis_post_id ON post_analysis(post_id);
CREATE INDEX idx_post_analysis_status ON post_analysis(analysis_status);
CREATE UNIQUE INDEX idx_post_analysis_post_id_unique ON post_analysis(post_id);
```

## Step 7: Create Voice Analysis Table

```sql
CREATE TABLE voice_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    overall_tone TEXT,
    writing_style TEXT,
    common_topics TEXT[],
    posting_patterns JSONB,
    engagement_patterns JSONB,
    strengths TEXT[],
    weaknesses TEXT[],
    top_performing_elements TEXT[],
    recommendations TEXT[],
    analysis_summary TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_voice_analysis_user_id ON voice_analysis(user_id);
CREATE UNIQUE INDEX idx_voice_analysis_user_id_unique ON voice_analysis(user_id);
```

## Step 8: Create Chats Table

```sql
CREATE TABLE chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT DEFAULT 'New Chat',
    chat_type chat_type DEFAULT 'standard',
    is_active BOOLEAN DEFAULT true,
    total_tokens INTEGER DEFAULT 0,
    message_count INTEGER DEFAULT 0,
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chats_user_id ON chats(user_id);
CREATE INDEX idx_chats_user_id_active ON chats(user_id, is_active);
CREATE INDEX idx_chats_last_message_at ON chats(last_message_at DESC);
```

## Step 9: Create Messages Table

```sql
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role message_role NOT NULL,
    content TEXT NOT NULL,
    token_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_chat_id ON messages(chat_id, created_at);
CREATE INDEX idx_messages_user_id ON messages(user_id);
```

## Step 10: Create Context Summaries Table

```sql
CREATE TABLE context_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    summary_text TEXT NOT NULL,
    messages_included INTEGER NOT NULL,
    token_count INTEGER NOT NULL,
    summary_type TEXT DEFAULT 'batch',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_context_summaries_chat_id ON context_summaries(chat_id, created_at DESC);
CREATE INDEX idx_context_summaries_user_id ON context_summaries(user_id);
```

## Step 11: Create Long Context Table

```sql
CREATE TABLE long_context (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    context_text TEXT NOT NULL,
    total_tokens INTEGER NOT NULL,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_long_context_user_id ON long_context(user_id);
CREATE UNIQUE INDEX idx_long_context_user_id_unique ON long_context(user_id);
```

## Step 12: Create RLS Policies

Enable RLS on all tables:

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE context_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE long_context ENABLE ROW LEVEL SECURITY;
```

Create policies for users table:

```sql
-- Users can read their own data
CREATE POLICY "Users can read own data" ON users
    FOR SELECT
    USING (clerk_user_id = auth.jwt() ->> 'sub');

-- Users can update their own data
CREATE POLICY "Users can update own data" ON users
    FOR UPDATE
    USING (clerk_user_id = auth.jwt() ->> 'sub');

-- Users can insert their own data
CREATE POLICY "Users can insert own data" ON users
    FOR INSERT
    WITH CHECK (clerk_user_id = auth.jwt() ->> 'sub');
```

Create policies for linkedin_profiles:

```sql
CREATE POLICY "Users can read own profiles" ON linkedin_profiles
    FOR SELECT
    USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can update own profiles" ON linkedin_profiles
    FOR UPDATE
    USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can insert own profiles" ON linkedin_profiles
    FOR INSERT
    WITH CHECK (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));
```

Create policies for linkedin_posts:

```sql
CREATE POLICY "Users can read own posts" ON linkedin_posts
    FOR SELECT
    USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can insert own posts" ON linkedin_posts
    FOR INSERT
    WITH CHECK (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can update own posts" ON linkedin_posts
    FOR UPDATE
    USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));
```

Create policies for post_analysis:

```sql
CREATE POLICY "Users can read own analysis" ON post_analysis
    FOR SELECT
    USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can insert own analysis" ON post_analysis
    FOR INSERT
    WITH CHECK (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can update own analysis" ON post_analysis
    FOR UPDATE
    USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));
```

Create policies for voice_analysis:

```sql
CREATE POLICY "Users can read own voice analysis" ON voice_analysis
    FOR SELECT
    USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can insert own voice analysis" ON voice_analysis
    FOR INSERT
    WITH CHECK (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can update own voice analysis" ON voice_analysis
    FOR UPDATE
    USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));
```

Create policies for chats:

```sql
CREATE POLICY "Users can read own chats" ON chats
    FOR SELECT
    USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can insert own chats" ON chats
    FOR INSERT
    WITH CHECK (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can update own chats" ON chats
    FOR UPDATE
    USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can delete own chats" ON chats
    FOR DELETE
    USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));
```

Create policies for messages:

```sql
CREATE POLICY "Users can read own messages" ON messages
    FOR SELECT
    USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can insert own messages" ON messages
    FOR INSERT
    WITH CHECK (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));
```

Create policies for context_summaries:

```sql
CREATE POLICY "Users can read own summaries" ON context_summaries
    FOR SELECT
    USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can insert own summaries" ON context_summaries
    FOR INSERT
    WITH CHECK (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));
```

Create policies for long_context:

```sql
CREATE POLICY "Users can read own context" ON long_context
    FOR SELECT
    USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can insert own context" ON long_context
    FOR INSERT
    WITH CHECK (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can update own context" ON long_context
    FOR UPDATE
    USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));
```

## Step 13: Create Database Functions

Create function to update timestamps:

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

Apply triggers to tables:

```sql
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_linkedin_profiles_updated_at BEFORE UPDATE ON linkedin_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_linkedin_posts_updated_at BEFORE UPDATE ON linkedin_posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_post_analysis_updated_at BEFORE UPDATE ON post_analysis
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_voice_analysis_updated_at BEFORE UPDATE ON voice_analysis
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chats_updated_at BEFORE UPDATE ON chats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

## Step 14: Create TypeScript Types File

Create `types/database.ts`:

```typescript
export type OnboardingStatus = 'pending' | 'profile_fetched' | 'posts_fetched' | 'analyzed' | 'completed';
export type ChatType = 'standard' | 'new_perspective';
export type MessageRole = 'user' | 'assistant' | 'system';
export type AnalysisStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface User {
  id: string;
  clerk_user_id: string;
  email: string;
  linkedin_profile_url: string | null;
  onboarding_status: OnboardingStatus;
  goals: string[];
  created_at: string;
  updated_at: string;
}

export interface LinkedInProfile {
  id: string;
  user_id: string;
  profile_url: string;
  full_name: string | null;
  headline: string | null;
  about: string | null;
  location: string | null;
  followers_count: number | null;
  connections_count: number | null;
  profile_image_url: string | null;
  raw_data: any;
  created_at: string;
  updated_at: string;
}

export interface LinkedInPost {
  id: string;
  user_id: string;
  post_url: string;
  post_text: string | null;
  posted_at: string | null;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  engagement_rate: number | null;
  raw_data: any;
  embedding: number[] | null;
  created_at: string;
  updated_at: string;
}

export interface PostAnalysis {
  id: string;
  user_id: string;
  post_id: string;
  tone: string | null;
  topics: string[];
  hook_analysis: string | null;
  engagement_analysis: string | null;
  what_worked: string | null;
  what_didnt_work: string | null;
  posting_time: string | null;
  analysis_status: AnalysisStatus;
  raw_analysis: any;
  created_at: string;
  updated_at: string;
}

export interface VoiceAnalysis {
  id: string;
  user_id: string;
  overall_tone: string | null;
  writing_style: string | null;
  common_topics: string[];
  posting_patterns: any;
  engagement_patterns: any;
  strengths: string[];
  weaknesses: string[];
  top_performing_elements: string[];
  recommendations: string[];
  analysis_summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface Chat {
  id: string;
  user_id: string;
  title: string;
  chat_type: ChatType;
  is_active: boolean;
  total_tokens: number;
  message_count: number;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  chat_id: string;
  user_id: string;
  role: MessageRole;
  content: string;
  token_count: number;
  created_at: string;
}

export interface ContextSummary {
  id: string;
  chat_id: string;
  user_id: string;
  summary_text: string;
  messages_included: number;
  token_count: number;
  summary_type: string;
  created_at: string;
}

export interface LongContext {
  id: string;
  user_id: string;
  context_text: string;
  total_tokens: number;
  last_updated: string;
  created_at: string;
}
```

## Step 15: Create Supabase Client Files

Create `lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

Create `lib/supabase/server.ts`:

```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            // Handle cookie setting errors
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch (error) {
            // Handle cookie removal errors
          }
        },
      },
    }
  )
}
```

## Next Steps

Proceed to `02-BACKEND-API.md` to implement API routes.