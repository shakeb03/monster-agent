-- ============================================
-- Supabase Database Setup for LinkedIn Content Agent
-- Run this entire file in Supabase SQL Editor
-- ============================================

-- Step 1: Enable pgvector Extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Step 2: Create Enums
-- User onboarding status
CREATE TYPE onboarding_status AS ENUM ('pending', 'profile_fetched', 'posts_fetched', 'analyzed', 'completed');

-- Chat types
CREATE TYPE chat_type AS ENUM ('standard', 'new_perspective');

-- Message roles
CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system');

-- Analysis status
CREATE TYPE analysis_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- Step 3: Create Users Table
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

-- Step 4: Create LinkedIn Profile Table
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

-- Step 5: Create LinkedIn Posts Table
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

-- Step 6: Create Post Analysis Table
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

-- Step 7: Create Voice Analysis Table
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

-- Step 8: Create Chats Table
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

-- Step 9: Create Messages Table
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

-- Step 10: Create Context Summaries Table
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

-- Step 11: Create Long Context Table
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

-- Step 12: Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE context_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE long_context ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users can read own data" ON users
    FOR SELECT
    USING (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can update own data" ON users
    FOR UPDATE
    USING (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can insert own data" ON users
    FOR INSERT
    WITH CHECK (clerk_user_id = auth.jwt() ->> 'sub');

-- RLS Policies for linkedin_profiles
CREATE POLICY "Users can read own profiles" ON linkedin_profiles
    FOR SELECT
    USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can update own profiles" ON linkedin_profiles
    FOR UPDATE
    USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can insert own profiles" ON linkedin_profiles
    FOR INSERT
    WITH CHECK (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

-- RLS Policies for linkedin_posts
CREATE POLICY "Users can read own posts" ON linkedin_posts
    FOR SELECT
    USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can insert own posts" ON linkedin_posts
    FOR INSERT
    WITH CHECK (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can update own posts" ON linkedin_posts
    FOR UPDATE
    USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

-- RLS Policies for post_analysis
CREATE POLICY "Users can read own analysis" ON post_analysis
    FOR SELECT
    USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can insert own analysis" ON post_analysis
    FOR INSERT
    WITH CHECK (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can update own analysis" ON post_analysis
    FOR UPDATE
    USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

-- RLS Policies for voice_analysis
CREATE POLICY "Users can read own voice analysis" ON voice_analysis
    FOR SELECT
    USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can insert own voice analysis" ON voice_analysis
    FOR INSERT
    WITH CHECK (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can update own voice analysis" ON voice_analysis
    FOR UPDATE
    USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

-- RLS Policies for chats
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

-- RLS Policies for messages
CREATE POLICY "Users can read own messages" ON messages
    FOR SELECT
    USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can insert own messages" ON messages
    FOR INSERT
    WITH CHECK (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

-- RLS Policies for context_summaries
CREATE POLICY "Users can read own summaries" ON context_summaries
    FOR SELECT
    USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can insert own summaries" ON context_summaries
    FOR INSERT
    WITH CHECK (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

-- RLS Policies for long_context
CREATE POLICY "Users can read own context" ON long_context
    FOR SELECT
    USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can insert own context" ON long_context
    FOR INSERT
    WITH CHECK (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can update own context" ON long_context
    FOR UPDATE
    USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

-- Step 13: Create Database Functions and Triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to tables
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

-- Step 14: Create Viral Patterns Table
CREATE TABLE viral_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pattern_type TEXT NOT NULL CHECK (pattern_type IN ('hook', 'format', 'cta', 'topic', 'timing', 'emotion')),
    pattern_description TEXT NOT NULL,
    success_rate DECIMAL(5,2) DEFAULT 0,
    example_post_ids TEXT[] DEFAULT '{}',
    times_used INTEGER DEFAULT 0,
    avg_engagement DECIMAL(5,2) DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_viral_patterns_user_id ON viral_patterns(user_id);
CREATE INDEX idx_viral_patterns_success ON viral_patterns(user_id, success_rate DESC);
CREATE INDEX idx_viral_patterns_type ON viral_patterns(pattern_type);

-- Step 15: Create Post Performance Table
CREATE TABLE post_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_content TEXT NOT NULL,
    predicted_engagement DECIMAL(5,2),
    actual_engagement DECIMAL(5,2),
    patterns_used TEXT[],
    posted_at TIMESTAMPTZ,
    measured_at TIMESTAMPTZ,
    outperformed BOOLEAN,
    learnings TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_post_performance_user_id ON post_performance(user_id, created_at DESC);
CREATE INDEX idx_post_performance_outperformed ON post_performance(user_id, outperformed);

-- Step 16: Enable RLS for Viral Tables
ALTER TABLE viral_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_performance ENABLE ROW LEVEL SECURITY;

-- RLS Policies for viral_patterns
CREATE POLICY "Users can read own viral patterns" ON viral_patterns
    FOR SELECT
    USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can insert own viral patterns" ON viral_patterns
    FOR INSERT
    WITH CHECK (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can update own viral patterns" ON viral_patterns
    FOR UPDATE
    USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

-- RLS Policies for post_performance
CREATE POLICY "Users can read own post performance" ON post_performance
    FOR SELECT
    USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can insert own post performance" ON post_performance
    FOR INSERT
    WITH CHECK (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

-- Step 17: Add Triggers for Viral Tables
CREATE TRIGGER update_viral_patterns_updated_at BEFORE UPDATE ON viral_patterns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Step 18: Create Agent Logs Table
CREATE TABLE agent_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request TEXT NOT NULL,
    tools_used TEXT[],
    context_tokens INTEGER,
    response_time_ms INTEGER,
    success BOOLEAN,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_logs_user_id ON agent_logs(user_id, created_at DESC);

-- Step 19: Enable RLS for Agent Logs
ALTER TABLE agent_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for agent_logs
CREATE POLICY "Users can read own agent logs" ON agent_logs
    FOR SELECT
    USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can insert own agent logs" ON agent_logs
    FOR INSERT
    WITH CHECK (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

