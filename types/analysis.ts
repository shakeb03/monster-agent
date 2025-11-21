export interface VoiceAnalysisData {
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
}

export interface PostWithAnalysis {
  id: string;
  post_text: string;
  post_url: string;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  engagement_rate: number | null;
  post_analysis?: {
    tone: string;
    topics: string[];
    hook_analysis: string;
    engagement_analysis: string;
    what_worked: string;
    what_didnt_work: string;
  };
}

export interface PostingStats {
  totalPosts: number;
  averageEngagement: string;
}

export interface AnalysisData {
  voiceAnalysis: VoiceAnalysisData | null;
  topPosts: PostWithAnalysis[];
  postingStats: PostingStats;
}
