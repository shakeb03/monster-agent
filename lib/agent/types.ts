export interface ToolDiagnostics<TAlternative = unknown> {
  reason?: string;
  suggestions?: string[];
  alternativeData?: TAlternative;
  issues?: string[];
}

export interface ToolResult<TData = unknown, TFallback = unknown, TAlternative = unknown> {
  success: boolean;
  data?: TData;
  error?: string;
  fallback?: TFallback;
  diagnostics?: ToolDiagnostics<TAlternative>;
}

export function successResult<T>(data: T): ToolResult<T> {
  return { success: true, data };
}

export function errorResult(
  error: string,
  diagnostics?: ToolDiagnostics
): ToolResult<never> {
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
