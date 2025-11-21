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

