export type OnboardingStep =
  | 'linkedin_url'
  | 'fetching_data'
  | 'goals'
  | 'analyzing'
  | 'completed';

export interface OnboardingState {
  step: OnboardingStep;
  linkedInUrl?: string;
  goals?: string[];
  error?: string;
}

export interface OnboardingProgress {
  profileFetched: boolean;
  postsFetched: boolean;
  goalsSubmitted: boolean;
  analysisCompleted: boolean;
}
