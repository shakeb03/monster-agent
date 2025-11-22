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

// Helper to check onboarding status
export function getNextOnboardingStep(status: string): string {
  const steps: Record<string, string> = {
    'pending': 'Complete LinkedIn profile connection',
    'profile_fetched': 'Import LinkedIn posts',
    'posts_fetched': 'Analyze posts for patterns',
    'analyzed': 'Set content goals',
    'completed': 'All set!',
  };
  
  return steps[status] || 'Complete onboarding';
}

