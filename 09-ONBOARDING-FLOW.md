# 09-ONBOARDING-FLOW.md - Onboarding Flow Implementation

## Step 1: Create Onboarding Chat Component

Create `components/onboarding/onboarding-chat.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import LinkedInUrlInput from './linkedin-url-input';
import GoalsInput from './goals-input';
import { useToast } from '@/components/ui/use-toast';

type OnboardingStep = 'linkedin_url' | 'fetching_data' | 'goals' | 'analyzing' | 'completed';

interface OnboardingChatProps {
  user: any;
}

export default function OnboardingChat({ user }: OnboardingChatProps) {
  const [step, setStep] = useState<OnboardingStep>('linkedin_url');
  const [linkedInUrl, setLinkedInUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function handleLinkedInSubmit(url: string) {
    setLinkedInUrl(url);
    setIsLoading(true);
    setStep('fetching_data');

    try {
      // Fetch LinkedIn profile
      const profileResponse = await fetch('/api/onboarding/linkedin-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileUrl: url }),
      });

      if (!profileResponse.ok) {
        throw new Error('Failed to fetch LinkedIn profile');
      }

      // Fetch LinkedIn posts
      const postsResponse = await fetch('/api/onboarding/linkedin-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileUrl: url }),
      });

      if (!postsResponse.ok) {
        throw new Error('Failed to fetch LinkedIn posts');
      }

      // Move to goals step
      setStep('goals');
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
      setStep('linkedin_url');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGoalsSubmit(goals: string[]) {
    setIsLoading(true);
    setStep('analyzing');

    try {
      // Save goals
      const goalsResponse = await fetch('/api/onboarding/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goals }),
      });

      if (!goalsResponse.ok) {
        throw new Error('Failed to save goals');
      }

      // Analyze posts
      const analysisResponse = await fetch('/api/onboarding/analyze-posts', {
        method: 'POST',
      });

      if (!analysisResponse.ok) {
        throw new Error('Failed to analyze posts');
      }

      toast({
        title: 'Success',
        description: 'Your profile has been analyzed!',
      });

      setStep('completed');
      
      // Redirect to chat after a brief delay
      setTimeout(() => {
        router.push('/chat');
        router.refresh();
      }, 1500);
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
      setStep('goals');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex h-screen w-full items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-6">
        {step === 'linkedin_url' && (
          <LinkedInUrlInput
            onSubmit={handleLinkedInSubmit}
            isLoading={isLoading}
          />
        )}

        {step === 'fetching_data' && (
          <div className="text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <div>
              <h2 className="text-2xl font-bold mb-2">Fetching your LinkedIn data</h2>
              <p className="text-muted-foreground">
                We're gathering your profile and recent posts. This may take a minute...
              </p>
            </div>
          </div>
        )}

        {step === 'goals' && (
          <GoalsInput onSubmit={handleGoalsSubmit} isLoading={isLoading} />
        )}

        {step === 'analyzing' && (
          <div className="text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <div>
              <h2 className="text-2xl font-bold mb-2">Analyzing your content</h2>
              <p className="text-muted-foreground">
                We're analyzing your writing style, voice, and what works best for you...
              </p>
            </div>
          </div>
        )}

        {step === 'completed' && (
          <div className="text-center space-y-4">
            <div className="h-12 w-12 mx-auto rounded-full bg-green-500/10 flex items-center justify-center">
              <svg
                className="h-6 w-6 text-green-500"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-2">All set!</h2>
              <p className="text-muted-foreground">
                Your profile is ready. Redirecting to chat...
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

## Step 2: Create LinkedIn URL Input Component

Create `components/onboarding/linkedin-url-input.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { validateLinkedInUrl } from '@/lib/apify/processors';

interface LinkedInUrlInputProps {
  onSubmit: (url: string) => void;
  isLoading?: boolean;
}

export default function LinkedInUrlInput({
  onSubmit,
  isLoading = false,
}: LinkedInUrlInputProps) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!url.trim()) {
      setError('Please enter your LinkedIn profile URL');
      return;
    }

    if (!validateLinkedInUrl(url)) {
      setError('Please enter a valid LinkedIn profile URL (e.g., https://linkedin.com/in/yourname)');
      return;
    }

    setError('');
    onSubmit(url.trim());
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Welcome! Let's get started</h1>
        <p className="text-muted-foreground">
          First, we need to analyze your LinkedIn profile and content to understand your unique voice.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="linkedin-url" className="text-sm font-medium">
            Enter your LinkedIn profile URL
          </label>
          <Input
            id="linkedin-url"
            type="url"
            placeholder="https://linkedin.com/in/yourname"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isLoading}
            className="text-lg"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="bg-secondary/50 p-4 rounded-lg space-y-2">
          <p className="text-sm font-medium">What we'll analyze:</p>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Your recent LinkedIn posts</li>
            <li>• Your writing style and tone</li>
            <li>• What content performs best for you</li>
            <li>• Your engagement patterns</li>
          </ul>
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
          {isLoading ? 'Analyzing...' : 'Continue'}
        </Button>
      </form>

      <p className="text-xs text-muted-foreground text-center">
        We only read public information from your LinkedIn profile. Your data is secure and private.
      </p>
    </div>
  );
}
```

## Step 3: Create Goals Input Component

Create `components/onboarding/goals-input.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';

const GOAL_OPTIONS = [
  { id: 'followers', label: 'Grow my follower count' },
  { id: 'engagement', label: 'Increase post engagement' },
  { id: 'thought_leadership', label: 'Build thought leadership' },
  { id: 'networking', label: 'Expand my professional network' },
  { id: 'brand', label: 'Strengthen my personal brand' },
  { id: 'leads', label: 'Generate leads or opportunities' },
];

interface GoalsInputProps {
  onSubmit: (goals: string[]) => void;
  isLoading?: boolean;
}

export default function GoalsInput({
  onSubmit,
  isLoading = false,
}: GoalsInputProps) {
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [customGoal, setCustomGoal] = useState('');

  function toggleGoal(goalId: string) {
    setSelectedGoals((prev) =>
      prev.includes(goalId)
        ? prev.filter((g) => g !== goalId)
        : [...prev, goalId]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const goals = [
      ...selectedGoals.map((id) => GOAL_OPTIONS.find((g) => g.id === id)?.label || ''),
      ...(customGoal.trim() ? [customGoal.trim()] : []),
    ].filter(Boolean);

    onSubmit(goals);
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">What are your LinkedIn goals?</h2>
        <p className="text-muted-foreground">
          Select all that apply. This helps us tailor content to your objectives.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-3">
          {GOAL_OPTIONS.map((goal) => (
            <div
              key={goal.id}
              className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors cursor-pointer"
              onClick={() => toggleGoal(goal.id)}
            >
              <Checkbox
                id={goal.id}
                checked={selectedGoals.includes(goal.id)}
                onCheckedChange={() => toggleGoal(goal.id)}
              />
              <label
                htmlFor={goal.id}
                className="flex-1 text-sm font-medium cursor-pointer"
              >
                {goal.label}
              </label>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <label htmlFor="custom-goal" className="text-sm font-medium">
            Other goals (optional)
          </label>
          <Textarea
            id="custom-goal"
            placeholder="Describe any other goals you have for LinkedIn..."
            value={customGoal}
            onChange={(e) => setCustomGoal(e.target.value)}
            disabled={isLoading}
            rows={3}
          />
        </div>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={isLoading || (selectedGoals.length === 0 && !customGoal.trim())}
        >
          {isLoading ? 'Processing...' : 'Continue'}
        </Button>
      </form>
    </div>
  );
}
```

## Step 4: Add Checkbox Component

Run:

```bash
npx shadcn-ui@latest add checkbox
```

## Step 5: Create Onboarding Progress Indicator

Create `components/onboarding/progress-indicator.tsx`:

```typescript
'use client';

import { cn } from '@/lib/utils';

interface ProgressStep {
  id: string;
  label: string;
  completed: boolean;
  active: boolean;
}

interface ProgressIndicatorProps {
  steps: ProgressStep[];
}

export default function ProgressIndicator({ steps }: ProgressIndicatorProps) {
  return (
    <div className="flex items-center justify-center space-x-2 mb-8">
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-center">
          <div
            className={cn(
              'flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors',
              step.completed && 'bg-primary border-primary text-primary-foreground',
              step.active && !step.completed && 'border-primary text-primary',
              !step.active && !step.completed && 'border-muted text-muted-foreground'
            )}
          >
            {step.completed ? (
              <svg
                className="w-5 h-5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path d="M5 13l4 4L19 7"></path>
              </svg>
            ) : (
              <span className="text-sm font-medium">{index + 1}</span>
            )}
          </div>
          {index < steps.length - 1 && (
            <div
              className={cn(
                'w-12 h-0.5 mx-2',
                step.completed ? 'bg-primary' : 'bg-muted'
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}
```

## Step 6: Update Onboarding Chat with Progress

Update `components/onboarding/onboarding-chat.tsx` to include progress:

```typescript
// Add at the top of the component:

const progressSteps = [
  {
    id: 'profile',
    label: 'Profile',
    completed: ['fetching_data', 'goals', 'analyzing', 'completed'].includes(step),
    active: step === 'linkedin_url' || step === 'fetching_data',
  },
  {
    id: 'goals',
    label: 'Goals',
    completed: ['analyzing', 'completed'].includes(step),
    active: step === 'goals',
  },
  {
    id: 'analysis',
    label: 'Analysis',
    completed: step === 'completed',
    active: step === 'analyzing',
  },
];

// Add before the content:
<ProgressIndicator steps={progressSteps} />
```

## Step 7: Create Onboarding Types

Create `types/onboarding.ts`:

```typescript
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
```

## Step 8: Create Onboarding Error Handling

Create `components/onboarding/onboarding-error.tsx`:

```typescript
'use client';

import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

interface OnboardingErrorProps {
  message: string;
  onRetry: () => void;
}

export default function OnboardingError({ message, onRetry }: OnboardingErrorProps) {
  return (
    <div className="text-center space-y-4">
      <div className="h-12 w-12 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
        <AlertCircle className="h-6 w-6 text-destructive" />
      </div>
      <div>
        <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
        <p className="text-muted-foreground">{message}</p>
      </div>
      <Button onClick={onRetry}>Try Again</Button>
    </div>
  );
}
```

## Step 9: Create Onboarding Status Check

Create `lib/onboarding/status.ts`:

```typescript
import { createClient } from '@/lib/supabase/server';
import type { OnboardingStatus } from '@/types/database';

export async function getUserOnboardingStatus(
  clerkUserId: string
): Promise<OnboardingStatus> {
  const supabase = await createClient();

  const { data: user } = await supabase
    .from('users')
    .select('onboarding_status')
    .eq('clerk_user_id', clerkUserId)
    .single();

  return user?.onboarding_status || 'pending';
}

export function isOnboardingComplete(status: OnboardingStatus): boolean {
  return status === 'completed';
}

export function getNextOnboardingStep(
  status: OnboardingStatus
): 'profile' | 'posts' | 'goals' | 'analysis' | null {
  switch (status) {
    case 'pending':
      return 'profile';
    case 'profile_fetched':
      return 'posts';
    case 'posts_fetched':
      return 'goals';
    case 'analyzed':
      return 'analysis';
    case 'completed':
      return null;
    default:
      return 'profile';
  }
}
```

## Next Steps

Proceed to `10-ANALYSIS-DISPLAY.md` for the analysis panel implementation.